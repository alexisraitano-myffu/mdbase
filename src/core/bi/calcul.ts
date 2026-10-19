import type { BlocAnalyse, EntreeEtat, Parametre, SourceSecondaire } from './analyse'
import { enrichir } from './fiche'
import { ErreurSql, identifiant, requete, substituer, type MoteurSql, type ResultatSql } from './sql'
import { instructionsChargement, type TableSql } from './tables'

// Calcul de l'analyse d'un dashboard (spec §10 « Analyse ») : charger les
// tables, puis exécuter chaque requête nommée et chaque requête propre à un bloc.

export type EtatRequete = { ok: true; resultat: ResultatSql & { coupe: boolean } } | { ok: false; erreur: string }

/** Ce qu'il faut d'un dashboard pour calculer son analyse. */
export type SourceAnalyse = {
  requetes: Readonly<Record<string, string>>
  parametres: readonly Parametre[]
  blocs: readonly { place: string; bloc: BlocAnalyse }[]
  etats?: Readonly<Record<string, readonly EntreeEtat[]>>
}

export type ResultatsAnalyse = {
  requetes: ReadonlyMap<string, EtatRequete>
  /** Par place de bloc (`rangée.bloc`, à partir de 0) : le résultat montré par chaque bloc ; `place/jalons` et `place/periodes` pour une frise. */
  blocs: ReadonlyMap<string, EtatRequete>
  /** Options d'un sélecteur à pastilles, avec le rang d'état de chacune. */
  options: ReadonlyMap<string, EtatRequete>
}

/**
 * Un moteur partagé : un calcul à la fois (il n'a qu'une connexion), et des
 * tables rechargées seulement quand l'espace ou les filtres ont changé.
 * `obtenir` crée le moteur au premier calcul ; un échec se retente au suivant.
 */
export class SessionSql {
  private moteur: Promise<MoteurSql> | null = null
  private file: Promise<unknown> = Promise.resolve()
  private charge: { source: unknown; retenues: unknown } | null = null

  constructor(private readonly obtenir: () => Promise<MoteurSql>) {}

  /** `source` : l'état de l'espace dont viennent les tables (comparé par identité), `tables` les produit au besoin. */
  executer<T>(source: unknown, retenues: ReadonlyMap<string, ReadonlySet<string>>, tables: () => readonly TableSql[], f: (m: MoteurSql) => Promise<T>): Promise<T> {
    const suite = this.file.then(async () => {
      this.moteur ??= this.obtenir().catch((e: unknown) => {
        this.moteur = null
        throw e
      })
      const m = await this.moteur
      const c = this.charge
      if (!c || c.source !== source || c.retenues !== retenues) {
        this.charge = null
        await chargerTables(m, tables())
        this.charge = { source, retenues }
      }
      return f(m)
    })
    this.file = suite.catch(() => undefined)
    return suite
  }
}

/** Sans filtre de dashboard : une seule instance, pour que les tables chargées servent d'un appel à l'autre. */
export const SANS_RETENUES: ReadonlyMap<string, ReadonlySet<string>> = new Map()

/** Recrée les tables, et retire celles d'une base qui n'existe plus. */
export async function chargerTables(moteur: MoteurSql, tables: readonly TableSql[]): Promise<void> {
  const existantes = await moteur.executer("select table_name as nom from information_schema.tables where table_schema = 'main'")
  const gardees = new Set(tables.map((t) => t.nom))
  for (const l of existantes.lignes) if (typeof l.nom === 'string' && !gardees.has(l.nom)) await moteur.executer(`drop table if exists ${identifiant(l.nom)}`)
  for (const instruction of instructionsChargement(tables)) await moteur.executer(instruction)
}

/** Message d'erreur lisible : celui de DuckDB sans sa pile, ou le nôtre. */
export function messageErreur(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.split('\n')[0]!.trim()
}

/** Exécute une requête de l'utilisateur, paramètres substitués ; ne lève jamais. */
export async function executerRequete(moteur: MoteurSql, sql: string, parametres: readonly Parametre[], aujourdhui: string, limite?: number): Promise<EtatRequete> {
  try {
    return { ok: true, resultat: await requete(moteur, substituer(sql, parametres, aujourdhui), limite) }
  } catch (e) {
    return { ok: false, erreur: messageErreur(e) }
  }
}

const introuvable = (nom: string): EtatRequete => ({ ok: false, erreur: new ErreurSql(`requête « ${nom} » introuvable dans le dashboard`).message })

/** Ce qu'une fiche ajoute à la requête d'un bloc : l'état de l'en-tête ou des pastilles, la sélection d'une liste. */
function ajoutDe(bloc: BlocAnalyse, etats: Readonly<Record<string, readonly EntreeEtat[]>>): { etat?: readonly EntreeEtat[]; garder?: string; tri?: string } | string {
  const nomEtat = bloc.type === 'entete' ? bloc.etat : bloc.type === 'liste' && bloc.pastille && Object.hasOwn(etats, bloc.pastille) ? bloc.pastille : undefined
  if (nomEtat !== undefined && !Object.hasOwn(etats, nomEtat)) return `état « ${nomEtat} » introuvable dans le dashboard`
  return {
    ...(nomEtat !== undefined && { etat: etats[nomEtat] }),
    ...(bloc.type === 'liste' && bloc.garder && { garder: bloc.garder }),
    ...(bloc.type === 'liste' && bloc.tri && { tri: bloc.tri }),
  }
}

/** Requêtes à exécuter (tables déjà chargées) ; une requête en erreur ne bloque pas les autres. */
export async function executerAnalyse(moteur: MoteurSql, src: SourceAnalyse, aujourdhui: string): Promise<ResultatsAnalyse> {
  const etats = src.etats ?? {}
  const executer = (sql: string) => executerRequete(moteur, sql, src.parametres, aujourdhui)
  const requetes = new Map<string, EtatRequete>()
  for (const [nom, sql] of Object.entries(src.requetes)) requetes.set(nom, await executer(sql))
  const sqlDe = (d: { donnees?: string; sql?: string }) => d.sql ?? (d.donnees !== undefined ? src.requetes[d.donnees] : undefined)
  const source = async (d: SourceSecondaire | BlocAnalyse): Promise<EtatRequete | undefined> => {
    const sql = sqlDe(d)
    return sql === undefined ? (d.donnees !== undefined ? introuvable(d.donnees) : undefined) : executer(sql)
  }

  const blocs = new Map<string, EtatRequete>()
  for (const { place, bloc } of src.blocs) {
    const sql = sqlDe(bloc)
    const ajout = ajoutDe(bloc, etats)
    if (typeof ajout === 'string') blocs.set(place, { ok: false, erreur: ajout })
    else if (sql === undefined) {
      if (bloc.donnees !== undefined) blocs.set(place, introuvable(bloc.donnees))
    } else if (Object.keys(ajout).length === 0 && bloc.donnees !== undefined && !bloc.sql) blocs.set(place, requetes.get(bloc.donnees)!)
    else blocs.set(place, await executer(enrichir(sql, ajout)))
    for (const cle of ['jalons', 'periodes'] as const) {
      const d = bloc.type === 'frise' ? bloc[cle] : undefined
      const r = d && (await source(d))
      if (r) blocs.set(`${place}/${cle}`, r)
    }
  }

  const options = new Map<string, EtatRequete>()
  for (const p of src.parametres) {
    if (!p.pastille || typeof p.options !== 'string') continue
    const sql = src.requetes[p.options]
    const entrees = etats[p.pastille]
    options.set(p.nom, sql === undefined ? introuvable(p.options) : !entrees ? { ok: false, erreur: `état « ${p.pastille} » introuvable dans le dashboard` } : await executer(enrichir(sql, { etat: entrees })))
  }
  return { requetes, blocs, options }
}

/**
 * Valeurs citées dans un texte : `{{requete.colonne}}` prend la première
 * ligne du résultat. Une citation qui ne se résout pas est rendue entre crochets.
 */
export function citer(texte: string, requetes: ReadonlyMap<string, EtatRequete>, formater: (v: unknown) => string): string {
  return texte.replace(/\{\{\s*([a-z_][a-z0-9_]*)\.([^\s}]+)\s*\}\}/g, (_, nom: string, colonne: string) => {
    const r = requetes.get(nom)
    if (!r?.ok) return `[${nom} : ${r ? 'erreur' : 'introuvable'}]`
    const ligne = r.resultat.lignes[0]
    return ligne && Object.hasOwn(ligne, colonne) ? formater(ligne[colonne]) : `[${nom}.${colonne} ?]`
  })
}
