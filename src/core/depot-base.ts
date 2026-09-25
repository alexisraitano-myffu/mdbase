import { enregistrerLigne, type FichierNonReconnu, type LigneChargee } from './base'
import { estConfiguration } from './espace'
import { FichierIntrouvable, joindre, parent, type AdaptateurFichiers } from './fichiers'
import { genererId, nomFichierLigne, type Aleatoire } from './identifiants'
import { changerIdentifiant, creerLigne, ErreurEcriture, lireLigne, type Modifications } from './ligne'
import { colonne, estSaisie, type Schema } from './schema'
import type { Changement } from './historique'
import { encoder, type Cellule, type Valeur } from './valeurs'

/** Programme `action` dans `ms` millisecondes ; renvoie de quoi l'annuler. Injecté : le cœur n'a pas de minuteur. */
export type Planifier = (action: () => void, ms: number) => () => void

export type OptionsDepot = {
  aleatoire: Aleatoire
  planifier: Planifier
  /** Délai de regroupement des écritures d'un même fichier (spec §12). */
  delai?: number
  /** Reçoit chaque changement de données, pour l'annulation (Ctrl+Z). */
  journal?: (c: Changement) => void
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
  /** Change à chaque opération sur un fichier : un rafraîchissement lu pendant l'une d'elles est jeté. */
  private generation = 0

  constructor(adaptateur: AdaptateurFichiers, schema: Schema, lignes: LigneChargee[], options: OptionsDepot) {
    this.adaptateur = adaptateur
    this.schema = schema
    this.options = { delai: 300, journal: () => undefined, ...options }
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
    const avant = entree.affichee.cellules[cle]
    this.options.journal({
      type: 'cellule',
      base: this.schema.id,
      id: entree.persistee.id,
      cle,
      avant: avant?.etat === 'ok' ? avant.valeur : undefined,
      apres: valeur,
    })
    entree.enAttente = { ...entree.enAttente, [cle]: valeur }
    entree.affichee = afficher(entree, this.schema)
    this.planifierEcriture(entree)
  }

  /** Modifie le corps Markdown : même regroupement des écritures que les cellules. */
  modifierCorps(chemin: string, corps: string): void {
    const entree = this.trouver(chemin)
    this.options.journal({ type: 'corps', base: this.schema.id, id: entree.persistee.id, avant: entree.affichee.corps, apres: corps })
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
    this.generation++
    const id = genererId(this.options.aleatoire, new Set(this.entrees.map((e) => e.persistee.id)))
    const titre = valeurs[this.schema.champTitre]
    const chemin = joindre(this.schema.id, nomFichierLigne(typeof titre === 'string' ? titre : '', id))
    const texte = creerLigne(this.schema, id, valeurs)
    await this.adaptateur.ecrire(chemin, texte)
    const lecture = lireLigne(chemin, texte, this.schema)
    if (!lecture.ok) throw new Error(`Ligne créée illisible : ${lecture.raison}`)
    const ligne = { ...lecture.ligne, date: await this.adaptateur.dateModification(chemin) }
    this.entrees.push({ persistee: ligne, affichee: ligne, enAttente: {}, corpsEnAttente: undefined, annuler: undefined, file: Promise.resolve() })
    this.generation++
    this.options.journal({ type: 'creee', base: this.schema.id, id })
    this.publier()
    return ligne
  }

  /**
   * Réécrit une ligne supprimée (annulation) : son fichier tel qu'il était,
   * puis les modifications qui n'avaient pas encore été écrites.
   */
  async restaurer(chemin: string, source: string, enAttente: Modifications = {}): Promise<void> {
    if (await this.existe(chemin)) throw new ErreurEcriture(`Un fichier porte déjà ce nom : ${chemin}`)
    this.generation++
    await this.adaptateur.ecrire(chemin, source)
    const lecture = lireLigne(chemin, source, this.schema)
    if (!lecture.ok) throw new Error(`Ligne restaurée illisible : ${lecture.raison}`)
    const ligne = { ...lecture.ligne, date: await this.adaptateur.dateModification(chemin) }
    this.entrees.push({ persistee: ligne, affichee: ligne, enAttente: {}, corpsEnAttente: undefined, annuler: undefined, file: Promise.resolve() })
    this.generation++
    this.options.journal({ type: 'creee', base: this.schema.id, id: ligne.id })
    this.publier()
    for (const [cle, v] of Object.entries(enAttente)) {
      const c = colonne(this.schema, cle)
      if (c && estSaisie(c)) this.modifier(chemin, cle, v)
    }
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
   * Supprime le fichier d'une ligne. Les modifications en attente sont
   * abandonnées ; les liens qui pointaient vers elle deviennent des liens cassés.
   */
  supprimer(chemin: string): Promise<void> {
    const e = this.trouver(chemin)
    this.options.journal({
      type: 'supprimee',
      base: this.schema.id,
      id: e.persistee.id,
      chemin: e.persistee.chemin,
      source: e.persistee.source,
      enAttente: { ...e.enAttente },
    })
    e.annuler?.()
    e.annuler = undefined
    e.enAttente = {}
    e.corpsEnAttente = undefined
    return this.enchainer(e, async () => {
      try {
        await this.adaptateur.supprimer(e.persistee.chemin)
      } catch (x) {
        if (!(x instanceof FichierIntrouvable)) throw x // déjà parti : c'est ce qu'on voulait
      }
      const i = this.entrees.indexOf(e)
      if (i >= 0) this.entrees.splice(i, 1)
    })
  }

  /** Id en double : garde cette version, supprime les autres fichiers qui portent le même id. */
  async garderVersion(chemin: string): Promise<void> {
    const gardee = this.trouver(chemin)
    const autres = this.entrees.filter((e) => e !== gardee && e.persistee.id === gardee.persistee.id)
    await Promise.all(autres.map((e) => this.supprimer(e.affichee.chemin)))
  }

  /**
   * Id en double : fait de cette version une ligne à part, avec un nouvel id
   * (et le nom de fichier qui va avec). Les liens existants restent sur l'autre.
   */
  async separer(chemin: string): Promise<string> {
    const e = this.trouver(chemin)
    this.lancerEcriture(e)
    const id = genererId(this.options.aleatoire, new Set(this.entrees.map((x) => x.persistee.id)))
    await this.enchainer(e, async () => {
      const texte = changerIdentifiant(await this.adaptateur.lire(e.persistee.chemin), id)
      const lue = lireLigne(e.persistee.chemin, texte, this.schema)
      if (!lue.ok) throw new Error(`Ligne illisible : ${lue.raison}`)
      const titre = lue.ligne.cellules[this.schema.champTitre]
      const nouveau = joindre(parent(e.persistee.chemin), nomFichierLigne(titre?.etat === 'ok' && typeof titre.valeur === 'string' ? titre.valeur : '', id))
      // Écrire la nouvelle avant d'effacer l'ancienne : une coupure laisse au pire un fichier de trop.
      await this.adaptateur.ecrire(nouveau, texte)
      if (nouveau !== e.persistee.chemin) await this.adaptateur.supprimer(e.persistee.chemin)
      e.persistee = { ...lue.ligne, chemin: nouveau, date: await this.adaptateur.dateModification(nouveau) }
      e.affichee = afficher(e, this.schema)
    })
    return id
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
    return this.reecrireColonne(cle, new Map())
  }

  /**
   * Réécrit une colonne dans toute la base : la valeur de chaque ligne est lue
   * dans `valeurs` (par id), une ligne absente est vidée. Hors historique : sert
   * aux changements de schéma. Renvoie le nombre de fichiers réécrits.
   */
  async reecrireColonne(cle: string, valeurs: ReadonlyMap<string, Valeur>): Promise<number> {
    await this.vider()
    let n = 0
    for (const e of this.entrees) {
      const valeur = valeurs.get(e.persistee.id)
      if (valeur === undefined && !(cle in e.persistee.cellules) && !contientCle(e.persistee.source, cle)) continue
      n++
      void this.enchainer(e, async () => {
        e.persistee = await enregistrerLigne(this.adaptateur, this.schema, e.persistee, { [cle]: valeur })
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

  /**
   * Relit le dossier de la base (spec §12, changements externes) : fichiers
   * modifiés, ajoutés ou supprimés depuis la dernière lecture. Les
   * modifications pas encore écrites restent affichées par-dessus la nouvelle
   * version, et l'écriture sûre les réappliquera sur celle-ci.
   *
   * Renvoie les fichiers non reconnus du dossier, ou `null` si une opération
   * de l'app a eu lieu pendant la lecture (rien n'est appliqué : au prochain coup).
   */
  async rafraichir(): Promise<{ change: boolean; nonReconnus: FichierNonReconnu[] } | null> {
    await Promise.all(this.entrees.map((e) => e.file))
    const depart = this.generation
    const connues = new Map(this.entrees.map((e) => [e.persistee.chemin, e]))
    const lues = new Map<string, LigneChargee>()
    const nonReconnus: FichierNonReconnu[] = []
    const vus = new Set<string>()
    for (const entree of await this.adaptateur.lister(this.schema.id)) {
      if (entree.type !== 'fichier' || estConfiguration(entree.nom) || !entree.nom.endsWith('.md')) continue
      const chemin = joindre(this.schema.id, entree.nom)
      vus.add(chemin)
      let date: number
      try {
        date = await this.adaptateur.dateModification(chemin)
      } catch (e) {
        if (e instanceof FichierIntrouvable) continue // supprimé pendant la lecture
        throw e
      }
      const connue = connues.get(chemin)
      if (connue && connue.persistee.date === date) continue
      const lecture = lireLigne(chemin, await this.adaptateur.lire(chemin), this.schema)
      if (lecture.ok) lues.set(chemin, { ...lecture.ligne, date })
      else nonReconnus.push({ chemin, raison: lecture.raison })
    }
    if (this.generation !== depart) return null

    let change = false
    for (let i = this.entrees.length - 1; i >= 0; i--) {
      const e = this.entrees[i]!
      const chemin = e.persistee.chemin
      const relue = lues.get(chemin)
      if (relue) {
        e.persistee = relue
        e.affichee = afficher(e, this.schema)
        lues.delete(chemin)
        change = true
      } else if (!vus.has(chemin) || nonReconnus.some((n) => n.chemin === chemin)) {
        // Disparu du disque, ou devenu illisible : la ligne n'existe plus pour l'app.
        e.annuler?.()
        this.entrees.splice(i, 1)
        change = true
      }
    }
    for (const l of lues.values()) {
      this.entrees.push({ persistee: l, affichee: l, enAttente: {}, corpsEnAttente: undefined, annuler: undefined, file: Promise.resolve() })
      change = true
    }
    if (change) this.publier()
    return { change, nonReconnus }
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
    this.generation++
    entree.file = entree.file.then(async () => {
      this.generation++
      try {
        await operation()
      } catch (e) {
        this.erreurCourante = `${entree.persistee.chemin} : ${e instanceof Error ? e.message : String(e)}`
      }
      this.generation++
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
