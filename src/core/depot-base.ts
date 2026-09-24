import { enregistrerLigne, type LigneChargee } from './base'
import { FichierIntrouvable, joindre, parent, type AdaptateurFichiers } from './fichiers'
import { genererId, nomFichierLigne, type Aleatoire } from './identifiants'
import { creerLigne, ErreurEcriture, lireLigne, type Modifications } from './ligne'
import { colonne, estSaisie, type Schema } from './schema'
import { encoder, type Cellule, type Valeur } from './valeurs'

/** Programme `action` dans `ms` millisecondes ; renvoie de quoi l'annuler. Injecté : le cœur n'a pas de minuteur. */
export type Planifier = (action: () => void, ms: number) => () => void

export type OptionsDepot = {
  aleatoire: Aleatoire
  planifier: Planifier
  /** Délai de regroupement des écritures d'un même fichier (spec §12). */
  delai?: number
}

type Entree = {
  /** État du fichier tel qu'écrit sur le disque. */
  persistee: LigneChargee
  /** Ce que voit l'utilisateur : persistee + modifications en attente. */
  affichee: LigneChargee
  enAttente: Modifications
  /** Nouveau corps pas encore écrit. */
  corpsEnAttente: string | undefined
  annuler: (() => void) | undefined
  /** Chaîne qui sérialise les opérations sur ce fichier. */
  file: Promise<void>
}

/**
 * État vivant d'une base ouverte (spec §12, « Écriture ») : les modifications
 * s'affichent immédiatement, les écritures sont regroupées par fichier puis
 * enchaînées, jamais en parallèle sur un même fichier.
 */
export class DepotBase {
  schema: Schema
  private readonly adaptateur: AdaptateurFichiers
  private readonly options: Required<OptionsDepot>
  private readonly entrees: Entree[]
  private readonly abonnes = new Set<() => void>()
  private instantane: readonly LigneChargee[] = []
  private erreurCourante: string | null = null

  constructor(adaptateur: AdaptateurFichiers, schema: Schema, lignes: LigneChargee[], options: OptionsDepot) {
    this.adaptateur = adaptateur
    this.schema = schema
    this.options = { delai: 300, ...options }
    this.entrees = lignes.map((l) => ({
      persistee: l,
      affichee: l,
      enAttente: {},
      corpsEnAttente: undefined,
      annuler: undefined,
      file: Promise.resolve(),
    }))
    this.publier()
  }

  /** Lignes affichées. Même référence tant que rien n'a changé (compatible useSyncExternalStore). */
  lignes = (): readonly LigneChargee[] => this.instantane

  erreur = (): string | null => this.erreurCourante

  abonner = (fn: () => void): (() => void) => {
    this.abonnes.add(fn)
    return () => this.abonnes.delete(fn)
  }

  /** Modifie une cellule : affichage immédiat, écriture après le délai de regroupement. */
  modifier(chemin: string, cle: string, valeur: Valeur | undefined): void {
    const c = colonne(this.schema, cle)
    if (!c || !estSaisie(c)) throw new ErreurEcriture(`Colonne non modifiable : ${cle}`)
    const entree = this.trouver(chemin)
    entree.enAttente = { ...entree.enAttente, [cle]: valeur }
    entree.affichee = afficher(entree, this.schema)
    this.planifierEcriture(entree)
  }

  /** Modifie le corps Markdown : même regroupement des écritures que les cellules. */
  modifierCorps(chemin: string, corps: string): void {
    const entree = this.trouver(chemin)
    entree.corpsEnAttente = corps
    entree.affichee = afficher(entree, this.schema)
    this.planifierEcriture(entree)
  }

  private planifierEcriture(entree: Entree) {
    entree.annuler?.()
    entree.annuler = this.options.planifier(() => void this.ecrire(entree), this.options.delai)
    this.publier()
  }

  /** Crée une ligne et l'écrit immédiatement (spec §8). Elle s'ajoute en fin de liste. */
  async creer(valeurs: Modifications = {}): Promise<LigneChargee> {
    const id = genererId(this.options.aleatoire, new Set(this.entrees.map((e) => e.persistee.id)))
    const titre = valeurs[this.schema.champTitre]
    const chemin = joindre(this.schema.id, nomFichierLigne(typeof titre === 'string' ? titre : '', id))
    const texte = creerLigne(this.schema, id, valeurs)
    await this.adaptateur.ecrire(chemin, texte)
    const lecture = lireLigne(chemin, texte, this.schema)
    if (!lecture.ok) throw new Error(`Ligne créée illisible : ${lecture.raison}`)
    const ligne = { ...lecture.ligne, date: await this.adaptateur.dateModification(chemin) }
    this.entrees.push({ persistee: ligne, affichee: ligne, enAttente: {}, corpsEnAttente: undefined, annuler: undefined, file: Promise.resolve() })
    this.publier()
    return ligne
  }

  /**
   * Aligne le nom du fichier sur le titre (spec §3). À appeler à la sortie du
   * champ titre, jamais à chaque frappe.
   */
  renommerSelonTitre(chemin: string): Promise<void> {
    const entree = this.trouver(chemin)
    this.lancerEcriture(entree)
    return this.enchainer(entree, async () => {
      const { persistee } = entree
      const titre = persistee.cellules[this.schema.champTitre]
      const texte = titre?.etat === 'ok' && typeof titre.valeur === 'string' ? titre.valeur : ''
      const nouveau = joindre(parent(persistee.chemin), nomFichierLigne(texte, persistee.id))
      if (nouveau === persistee.chemin || (await this.existe(nouveau))) return
      await this.adaptateur.renommer(persistee.chemin, nouveau)
      const date = await this.adaptateur.dateModification(nouveau)
      entree.persistee = { ...persistee, chemin: nouveau, date }
      entree.affichee = { ...entree.affichee, chemin: nouveau }
    })
  }

  /**
   * Adopte un nouveau schéma : chaque ligne est relue depuis son texte, pour
   * qu'une valeur devenue valide (option ajoutée…) ou une colonne retirée
   * soit prise en compte.
   */
  remplacerSchema(schema: Schema): void {
    this.schema = schema
    for (const e of this.entrees) {
      const relue = lireLigne(e.persistee.chemin, e.persistee.source, schema)
      if (!relue.ok) continue
      e.persistee = { ...relue.ligne, date: e.persistee.date }
      e.enAttente = Object.fromEntries(
        Object.entries(e.enAttente).filter(([cle]) => {
          const c = colonne(schema, cle)
          return c !== undefined && estSaisie(c)
        }),
      )
      e.affichee = afficher(e, schema)
    }
    this.publier()
  }

  /**
   * Retire une colonne de tous les fichiers de lignes qui la contiennent
   * (suppression de colonne, spec §5). À faire AVANT de la retirer du schéma.
   * Renvoie le nombre de fichiers réécrits.
   */
  async effacerColonne(cle: string): Promise<number> {
    await this.vider()
    let n = 0
    for (const e of this.entrees) {
      if (!(cle in e.persistee.cellules) && !contientCle(e.persistee.source, cle)) continue
      n++
      void this.enchainer(e, async () => {
        e.persistee = await enregistrerLigne(this.adaptateur, this.schema, e.persistee, { [cle]: undefined })
        e.affichee = afficher(e, this.schema)
      })
    }
    await Promise.all(this.entrees.map((e) => e.file))
    return n
  }

  /** Renomme tous les fichiers selon leur titre (changement de colonne titre). */
  async renommerTousSelonTitre(): Promise<void> {
    await Promise.all(this.entrees.map((e) => this.renommerSelonTitre(e.affichee.chemin)))
  }

  /** Écrit immédiatement tout ce qui est en attente (fermeture de l'onglet, tests). */
  async vider(): Promise<void> {
    for (const e of this.entrees) this.lancerEcriture(e)
    await Promise.all(this.entrees.map((e) => e.file))
  }

  private lancerEcriture(entree: Entree) {
    if (entree.annuler === undefined) return
    entree.annuler()
    void this.ecrire(entree)
  }

  private ecrire(entree: Entree): Promise<void> {
    const modifs = entree.enAttente
    const corps = entree.corpsEnAttente
    entree.enAttente = {}
    entree.corpsEnAttente = undefined
    entree.annuler = undefined
    return this.enchainer(entree, async () => {
      entree.persistee = await enregistrerLigne(this.adaptateur, this.schema, entree.persistee, modifs, corps)
      // D'autres modifications ont pu arriver pendant l'écriture : elles restent affichées.
      entree.affichee = afficher(entree, this.schema)
    })
  }

  private enchainer(entree: Entree, operation: () => Promise<void>): Promise<void> {
    entree.file = entree.file.then(async () => {
      try {
        await operation()
      } catch (e) {
        this.erreurCourante = `${entree.persistee.chemin} : ${e instanceof Error ? e.message : String(e)}`
      }
      this.publier()
    })
    return entree.file
  }

  private async existe(chemin: string): Promise<boolean> {
    try {
      await this.adaptateur.dateModification(chemin)
      return true
    } catch (e) {
      if (e instanceof FichierIntrouvable) return false
      throw e
    }
  }

  private trouver(chemin: string): Entree {
    const e = this.entrees.find((x) => x.affichee.chemin === chemin)
    if (!e) throw new Error(`Ligne introuvable : ${chemin}`)
    return e
  }

  private publier() {
    this.instantane = this.entrees.map((e) => e.affichee)
    for (const fn of this.abonnes) fn()
  }
}

/** La clé apparaît-elle dans le frontmatter, même sans valeur (`statut:`) ? */
function contientCle(source: string, cle: string): boolean {
  const echappee = cle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${echappee}\\s*:`, 'm').test(source.split(/^---\s*$/m, 3)[1] ?? '')
}

function afficher(e: Entree, schema: Schema): LigneChargee {
  const l = superposer(e.persistee, e.enAttente, schema)
  return e.corpsEnAttente === undefined ? l : { ...l, corps: e.corpsEnAttente }
}

function superposer(ligne: LigneChargee, modifs: Modifications, schema: Schema): LigneChargee {
  if (Object.keys(modifs).length === 0) return ligne
  const cellules: Record<string, Cellule> = { ...ligne.cellules }
  for (const [cle, valeur] of Object.entries(modifs)) {
    const c = colonne(schema, cle)!
    const encodee = encoder(c, valeur)
    if (encodee === undefined) delete cellules[cle]
    else cellules[cle] = { etat: 'ok', valeur: valeur! }
  }
  return { ...ligne, cellules }
}
