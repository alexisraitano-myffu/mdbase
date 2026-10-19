import { colonnesManquantes, estCouleur, FORMATS, lireCondition, lireParametres, NOM_VALIDE, nomAnalyse, TYPES_VISUEL, estFormat, type BlocAnalyse, type EntreeEtat, type Etape, type Format, type Parametre, type Regle, type SourceSecondaire, type TypeVisuel } from '../bi/analyse'
import { executerAnalyse, executerRequete, SANS_RETENUES, type SessionSql } from '../bi/calcul'
import type { ResultatSql, ValeurSql } from '../bi/sql'
import { sourceDe, tablesSql } from '../bi/tables'
import { COULEURS } from '../couleurs'
import { appliquerEnMemoire, estAnalyse, type Dashboard, type ModificationAnalyse } from '../dashboard'
import type { EtatEspace } from '../depot-espace'
import { retenues } from '../filtre-global'
import type { ActionStructure } from './structure'
import { estObjet } from '../schema'
import { erreur } from './references'

// Blocs d'analyse, requêtes et paramètres proposés par l'assistant ou Claude
// (spec §10 « Analyse ») : lus strictement, chaque erreur dit quoi corriger.
// Le SQL lui-même est vérifié à part, en l'exécutant (voir `verifierAnalyse`).

/** Réglages d'un bloc d'analyse, tels que les outils les acceptent. */
const REGLAGES = [
  'type', 'titre', 'donnees', 'sql', 'x', 'y', 'serie', 'taille', 'valeur', 'comparer', 'empile', 'horizontal', 'colonnes', 'format', 'regles', 'texte', 'largeur',
  // Fiches (spec §10 « Fiches »)
  'sous_titre', 'etat', 'date', 'libelle', 'seuils', 'vide', 'element', 'etape', 'statut', 'groupe', 'detail_groupe', 'etapes', 'couleurs', 'detail', 'pastille', 'garder', 'tri', 'max', 'ordre', 'ligne', 'debut', 'fin', 'categorie', 'previsionnel', 'jalons', 'periodes',
] as const // prettier-ignore

const COULEURS_ACCEPTEES = `une couleur de l'espace (${COULEURS.join(', ')}), un hexadécimal #rrggbb, vide ou aucune`

/** Une table valeur → couleur. */
export function lireTableCouleursIA(cle: string, v: unknown): Record<string, string> {
  if (!estObjet(v) || Object.keys(v).length === 0) return erreur(`${cle} : table { valeur: couleur } attendue`)
  for (const [valeur, c] of Object.entries(v)) if (!estCouleur(c)) erreur(`${cle} : couleur de « ${valeur} » : ${COULEURS_ACCEPTEES}`)
  return v as Record<string, string>
}

function lireEtapes(v: unknown): Etape[] {
  if (!Array.isArray(v) || v.length === 0) return erreur('etapes : liste ordonnée de noms, ou de { nom, court } attendue')
  return v.map((e, i) => {
    if (typeof e === 'string' && e !== '') return { nom: e }
    if (estObjet(e) && typeof e.nom === 'string' && e.nom !== '' && (e.court === undefined || typeof e.court === 'string')) return { nom: e.nom, ...(e.court && { court: e.court as string }) }
    return erreur(`étape ${i + 1} : un nom, ou { nom, court }`)
  })
}

const CLES_SOURCE = ['donnees', 'sql', 'date', 'debut', 'fin', 'libelle', 'ligne', 'couleur'] as const

function lireSourceIA(cle: string, v: unknown): SourceSecondaire {
  if (!estObjet(v)) return erreur(`${cle} : objet { donnees ou sql, ${cle === 'jalons' ? 'date, libelle, ligne, couleur' : 'debut, fin, libelle'} } attendu`)
  const inconnues = Object.keys(v).filter((k) => !(CLES_SOURCE as readonly string[]).includes(k))
  if (inconnues.length > 0) erreur(`${cle} : réglage inconnu ${inconnues.join(', ')} (réglages : ${CLES_SOURCE.join(', ')})`)
  for (const [k, x] of Object.entries(v)) texte(`${cle}.${k}`, x)
  if (!v.donnees && !v.sql) erreur(`${cle} : \`donnees\` (requête nommée) ou \`sql\` attendu`)
  return v as SourceSecondaire
}

const texte = (cle: string, v: unknown): string => (typeof v === 'string' && v.trim() !== '' ? v : erreur(`${cle} : texte attendu`))
const liste = (cle: string, v: unknown): string[] => {
  const l = typeof v === 'string' ? [v] : Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x !== '') ? (v as string[]) : erreur(`${cle} : une colonne ou une liste de colonnes attendue`)
  return l
}

function lireFormat(v: unknown): Format | Record<string, Format> {
  if (estFormat(v)) return v
  if (estObjet(v) && Object.keys(v).length > 0 && Object.values(v).every(estFormat)) return v as Record<string, Format>
  return erreur(`format : un parmi ${FORMATS.join(', ')}, ou { colonne: format }`)
}

function lireRegles(v: unknown): Regle[] {
  if (!Array.isArray(v)) return erreur('regles : liste de { si, couleur, colonne?, ligne? } attendue')
  return v.map((r, i) => {
    if (!estObjet(r) || typeof r.si !== 'string' || !lireCondition(r.si)) return erreur(`règle ${i + 1} : « si » attendu, un opérateur (>, >=, <, <=, =, !=) puis une valeur ou une colonne, ex. '> 50'`)
    if (!estCouleur(r.couleur)) return erreur(`règle ${i + 1} : couleur : ${COULEURS_ACCEPTEES}`)
    return { ...(typeof r.colonne === 'string' && { colonne: r.colonne }), si: r.si, couleur: r.couleur, ...(r.ligne === true && { ligne: true }) }
  })
}

/** Un réglage lu ; `null` (pour une modification) le retire. */
function reglage(cle: (typeof REGLAGES)[number], v: unknown): unknown {
  switch (cle) {
    case 'type':
      return (TYPES_VISUEL as readonly string[]).includes(String(v)) ? v : erreur(`type de bloc d'analyse inconnu : ${JSON.stringify(v)} (types : ${TYPES_VISUEL.join(', ')})`)
    case 'y':
    case 'colonnes':
      return liste(cle, v)
    case 'empile':
    case 'horizontal':
      return typeof v === 'boolean' ? v || null : erreur(`${cle} : true ou false`)
    case 'format':
      return lireFormat(v)
    case 'regles':
      return lireRegles(v)
    case 'largeur':
      return v
    case 'seuils':
      return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) && v[0] <= v[1] ? v : erreur('seuils : deux nombres de jours croissants, [rouge sous, orange sous], ex. [8, 31]')
    case 'max':
      return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : erreur('max : un nombre entier positif')
    case 'ordre':
      return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x !== '') ? v : erreur('ordre : liste de valeurs attendue')
    case 'etapes':
      return lireEtapes(v)
    case 'couleurs':
      return typeof v === 'string' && v !== '' ? v : lireTableCouleursIA('couleurs', v)
    case 'jalons':
    case 'periodes':
      return lireSourceIA(cle, v)
    default:
      return texte(cle, v)
  }
}

function verifierCles(brut: Record<string, unknown>, ignorees: readonly string[] = []) {
  const inconnues = Object.keys(brut).filter((k) => !(REGLAGES as readonly string[]).includes(k) && !ignorees.includes(k))
  if (inconnues.length > 0) erreur(`réglage inconnu : ${inconnues.join(', ')} (réglages : ${REGLAGES.join(', ')})`)
}

function verifierSource(b: BlocAnalyse, requetes: Readonly<Record<string, string>>) {
  if (b.type === 'texte') {
    if (!b.texte) erreur('bloc texte : `texte` attendu (Markdown ; {{requete.colonne}} cite un résultat)')
    return
  }
  if (b.donnees && b.sql) erreur('bloc d’analyse : `donnees` (requête nommée) ou `sql`, pas les deux')
  if (!b.donnees && !b.sql) erreur('bloc d’analyse : `donnees` (nom d’une requête du dashboard) ou `sql` attendu')
  if (b.donnees && requetes[b.donnees] === undefined) erreur(`requête « ${b.donnees} » inconnue dans le dashboard (requêtes : ${Object.keys(requetes).join(', ') || 'aucune'})`)
}

/** Bloc d'analyse proposé (sans `largeur`, lue à part comme pour un bloc vue). */
export function lireBlocAnalyseIA(brut: Record<string, unknown>, requetes: Readonly<Record<string, string>>): BlocAnalyse {
  verifierCles(brut)
  const bloc: Record<string, unknown> = {}
  for (const cle of REGLAGES) {
    if (cle === 'largeur' || brut[cle] === undefined || brut[cle] === null) continue
    const v = reglage(cle, brut[cle])
    if (v !== null) bloc[cle] = v
  }
  const b = bloc as BlocAnalyse
  verifierSource(b, requetes)
  return b
}

/** Modification d'un bloc d'analyse existant : seulement les réglages donnés, `null` en retire un. */
export function lireModifsAnalyse(brut: Record<string, unknown>, avant: BlocAnalyse, requetes: Readonly<Record<string, string>>): ModificationAnalyse {
  const { rangee: _r, bloc: _b, type: _t, ...reste } = brut
  verifierCles(reste, ['nouveau_type'])
  const modifs: Record<string, unknown> = {}
  if (brut.nouveau_type !== undefined) modifs.type = reglage('type', brut.nouveau_type)
  for (const [cle, v] of Object.entries(reste)) {
    if (cle === 'largeur' || cle === 'nouveau_type') continue
    modifs[cle] = v === null ? null : reglage(cle as (typeof REGLAGES)[number], v)
  }
  if (Object.keys(modifs).length === 0) erreur('modifier_bloc : aucun réglage à changer')
  // Le bloc tel qu'il sera, pour vérifier qu'il a toujours quelque chose à montrer.
  const apres = { ...avant } as Record<string, unknown>
  for (const [cle, v] of Object.entries(modifs)) {
    if (v === null) delete apres[cle]
    else apres[cle] = v
  }
  verifierSource(apres as BlocAnalyse, requetes)
  return modifs as ModificationAnalyse
}

export function lireRequetesIA(brut: unknown): Record<string, string> {
  if (brut === undefined) return {}
  if (!estObjet(brut)) return erreur('requetes : objet { nom: "select …" } attendu')
  for (const [nom, sql] of Object.entries(brut)) {
    if (!NOM_VALIDE.test(nom)) erreur(`requête « ${nom} » : nom en minuscules, chiffres et _ (commence par une lettre)`)
    if (typeof sql !== 'string' || sql.trim() === '') erreur(`requête « ${nom} » : SQL attendu`)
  }
  return brut as Record<string, string>
}

export function lireParametresIA(brut: unknown): Parametre[] {
  if (!Array.isArray(brut)) return erreur('parametres : liste de { nom, type, libelle?, options?, defaut? } attendue ; vide les retire')
  const avertissements: string[] = []
  const parametres = lireParametres(brut, 'proposé', avertissements)
  if (avertissements.length > 0) erreur(avertissements.map((a) => a.replace('Dashboard proposé : ', '')).join(' ; '))
  return parametres
}

/** Tables de couleurs nommées d'un dashboard. */
export function lireCouleursIA(brut: unknown): Record<string, Record<string, string>> {
  if (brut === undefined) return {}
  if (!estObjet(brut)) return erreur('couleurs : objet { nom: { valeur: couleur } } attendu')
  return Object.fromEntries(Object.entries(brut).map(([nom, table]) => [nom, lireTableCouleursIA(`couleurs « ${nom} »`, table)]))
}

/** Un état : liste ordonnée d'entrées { si (SQL), couleur, libelle, raison } ; sans `si`, l'entrée par défaut. */
export function lireEntreesEtatIA(nom: string, v: unknown): EntreeEtat[] {
  if (!Array.isArray(v) || v.length === 0) return erreur(`état « ${nom} » : liste de { si, couleur, libelle, raison } attendue`)
  return v.map((e, i) => {
    if (!estObjet(e)) return erreur(`état « ${nom} », entrée ${i + 1} : objet attendu`)
    const inconnues = Object.keys(e).filter((k) => !['si', 'couleur', 'libelle', 'raison'].includes(k))
    if (inconnues.length > 0) erreur(`état « ${nom} », entrée ${i + 1} : réglage inconnu ${inconnues.join(', ')} (si, couleur, libelle, raison)`)
    if (!estCouleur(e.couleur)) erreur(`état « ${nom} », entrée ${i + 1} : couleur : ${COULEURS_ACCEPTEES}`)
    for (const k of ['si', 'libelle', 'raison'] as const) if (e[k] !== undefined) texte(`état « ${nom} », entrée ${i + 1}, ${k}`, e[k])
    return { ...(e.si !== undefined && { si: e.si as string }), couleur: e.couleur as string, ...(e.libelle !== undefined && { libelle: e.libelle as string }), ...(e.raison !== undefined && { raison: e.raison as string }) }
  })
}

export function lireEtatsIA(brut: unknown): Record<string, EntreeEtat[]> {
  if (brut === undefined) return {}
  if (!estObjet(brut)) return erreur('etats : objet { nom: [{ si, couleur, libelle, raison }] } attendu')
  return Object.fromEntries(
    Object.entries(brut).map(([nom, entrees]) => {
      if (!NOM_VALIDE.test(nom)) erreur(`état « ${nom} » : nom en minuscules, chiffres et _ (commence par une lettre)`)
      return [nom, lireEntreesEtatIA(nom, entrees)]
    }),
  )
}

export const estTypeVisuel = (x: unknown): x is TypeVisuel => (TYPES_VISUEL as readonly string[]).includes(String(x))

// ── Exécution : exploration et vérification du SQL ───────────────

/** Lignes renvoyées par `executer_sql` au plus ; au-delà, le modèle agrège ou filtre. */
export const LIGNES_SQL_MAX = 200

export type ContexteSql = { aujourdhui: string; sql?: SessionSql }

const cellule = (v: ValeurSql | undefined): string => (v === null || v === undefined ? '' : Array.isArray(v) ? `[${v.map(cellule).join(', ')}]` : String(v).replace(/\s+/g, ' '))

/** Un résultat lisible par le modèle : colonnes typées, puis une ligne par résultat. */
export function resultatLisible(r: ResultatSql & { coupe: boolean }): string {
  const entete = `${r.lignes.length}${r.coupe ? ` premières lignes (résultat coupé : agrège ou filtre)` : ` ligne${r.lignes.length > 1 ? 's' : ''}`} ; colonnes : ${r.colonnes.map((c) => `${c.nom} (${c.nature})`).join(', ') || 'aucune'}`
  return [entete, r.colonnes.map((c) => c.nom).join(' | '), ...r.lignes.map((l) => r.colonnes.map((c) => cellule(l[c.nom])).join(' | '))].join('\n')
}

/** Outil `executer_sql` : une requête de lecture sur les tables de l'espace, filtrée par un dashboard si on le nomme. */
export async function executerSqlOutil(etat: EtatEspace, args: Record<string, unknown>, ctx: ContexteSql): Promise<string> {
  if (!ctx.sql) return erreur('moteur SQL indisponible ici')
  const sql = texte('sql', args.sql)
  let parametres: readonly Parametre[] = []
  let filtres: ReadonlyMap<string, ReadonlySet<string>> = SANS_RETENUES
  if (args.dashboard !== undefined) {
    const ref = texte('dashboard', args.dashboard)
    const d = etat.dashboards.find((x) => x.id === ref || x.dashboard?.nom === ref)?.dashboard ?? erreur(`dashboard inconnu : « ${ref} »`)
    parametres = d.parametres
    if (d.filtres.length > 0 || d.filtresRapides.length > 0) filtres = retenues(sourceDe(etat), d.filtres, d.filtresRapides, { aujourdhui: ctx.aujourdhui })
  }
  const r = await ctx.sql.executer(etat, filtres, () => tablesSql(sourceDe(etat), filtres), (m) => executerRequete(m, sql, parametres, ctx.aujourdhui, LIGNES_SQL_MAX))
  return r.ok ? resultatLisible(r.resultat) : erreur(`SQL refusé : ${r.erreur}`)
}

/** Le dashboard tel qu'il sera après une action de structure, s'il porte de l'analyse à vérifier. */
function dashboardApres(etat: EtatEspace, a: ActionStructure): Dashboard | null {
  if (a.type === 'creer_dashboard') return { id: a.id, nom: a.nom, rangees: a.rangees, filtres: [], filtresRapides: [], requetes: a.requetes, parametres: a.parametres, couleurs: a.couleurs, etats: a.etats }
  if (a.type !== 'modifier_dashboard') return null
  const touche = a.operations.some(({ op }) => ['requete', 'parametres', 'valeur_parametre', 'modifier_analyse', 'couleurs', 'etat'].includes(op.type) || ((op.type === 'ajouter_bloc' || op.type === 'remplacer_bloc') && estAnalyse(op.bloc)))
  const avant = etat.dashboards.find((x) => x.id === a.id)?.dashboard
  if (!touche || !avant) return null
  return a.operations.reduce((d, { op }) => appliquerEnMemoire(d, op), avant)
}

/**
 * Exécute les requêtes que des actions de structure ajoutent ou changent,
 * avant de les accepter. Renvoie les erreurs (vide : tout passe). Une base ou
 * une colonne créée par le même plan n'existe pas encore pour le moteur : la
 * vérification est alors laissée à l'affichage.
 */
export async function verifierAnalyse(etat: EtatEspace, actions: readonly ActionStructure[], ctx: ContexteSql): Promise<string[]> {
  const session = ctx.sql
  if (!session || actions.some((a) => a.type === 'creer_base' || a.type === 'ajouter_colonne')) return []
  const erreurs: string[] = []
  for (const a of actions) {
    const d = dashboardApres(etat, a)
    if (!d) continue
    const blocs = d.rangees.flatMap((r, i) => r.blocs.flatMap((bloc, j) => (estAnalyse(bloc) ? [{ place: `${i}.${j}`, bloc }] : [])))
    if (Object.keys(d.requetes).length === 0 && blocs.length === 0) continue
    const r = await session.executer(etat, SANS_RETENUES, () => tablesSql(sourceDe(etat), SANS_RETENUES), (m) => executerAnalyse(m, { requetes: d.requetes, parametres: d.parametres, blocs, etats: d.etats }, ctx.aujourdhui))
    for (const [nom, e] of r.requetes) if (!e.ok) erreurs.push(`requête « ${nom} » : ${e.erreur}`)
    for (const [nom, e] of r.options) if (!e.ok) erreurs.push(`paramètre « ${nom} » (pastilles) : ${e.erreur}`)
    for (const { place, bloc } of blocs) {
      const e = r.blocs.get(place)
      const [rangee, rang] = place.split('.').map((x) => Number(x) + 1)
      const ou = `rangée ${rangee}, bloc ${rang} (${nomAnalyse(bloc)})`
      // L'erreur d'une requête nommée est déjà signalée ; celle d'un bloc qui l'enrichit (état, sélection) ne l'est pas.
      const nommee = bloc.donnees !== undefined ? r.requetes.get(bloc.donnees) : undefined
      if (e && !e.ok && (bloc.sql || !nommee || nommee.ok)) erreurs.push(`${ou} : ${e.erreur}`)
      for (const cle of ['jalons', 'periodes'] as const) {
        const s = r.blocs.get(`${place}/${cle}`)
        if (s && !s.ok) erreurs.push(`${ou}, ${cle} : ${s.erreur}`)
      }
      if (e?.ok) {
        const manquantes = colonnesManquantes(bloc, e.resultat, d.etats)
        if (manquantes.length > 0) erreurs.push(`${ou} : colonne${manquantes.length > 1 ? 's' : ''} ${manquantes.join(', ')} absente${manquantes.length > 1 ? 's' : ''} du résultat (colonnes : ${e.resultat.colonnes.map((c) => c.nom).join(', ')})`)
      }
    }
  }
  return erreurs
}
