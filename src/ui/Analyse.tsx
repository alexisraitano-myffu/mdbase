import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarRange, ChartArea, ChartBarStacked, ChartColumn, ChartGantt, ChartLine, ChartPie, ChartScatter, Ellipsis, List, PanelTop, Timer, Hash, LoaderCircle, SlidersHorizontal, Table2, TrendingDown, TrendingUp, TriangleAlert, Type, type LucideIcon } from 'lucide-react'
import { domToBlob } from 'modern-screenshot'
import { colonnesManquantes, nomAnalyse, type BlocAnalyse, type EntreeEtat, type Parametre, type TypeVisuel } from '../core/bi/analyse'
import { etatDe } from '../core/bi/fiche'
import { citer, executerAnalyse, type EtatRequete, type ResultatsAnalyse } from '../core/bi/calcul'
import { sessionSql } from '../adapters/sql/session-app'
import { couleurRegle, formatDe, formater } from '../core/bi/regles'
import type { ResultatSql, ValeurSql } from '../core/bi/sql'
import { sourceDe, tablesSql } from '../core/bi/tables'
import { estAnalyse, type Dashboard, type ModificationAnalyse, type PlaceBloc } from '../core/dashboard'
import type { Schema } from '../core/schema'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
import { couleurOption } from './couleurs'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { CompteARebours, EnteteFiche, EtapesFiche, Frise, lisereCompte, ListeFiche, Point, Repartition, teinte } from './Fiches'
import { ContenuMarkdown } from './Markdown'
import { useConsultation } from './mode'
import { Choix } from './Choix'
import { ReglagesBloc } from './ReglagesAnalyse'
import { useAujourdhui } from './useAujourdhui'

// Analyse dans les dashboards (spec §10 « Analyse ») : calcul des requêtes
// par DuckDB-WASM, chargé à la première requête, et blocs qui en montrent les
// résultats (chiffre clé, graphique, tableau, texte).

const GraphiqueAnalyse = lazy(() => import('./GraphiqueAnalyse').then((m) => ({ default: m.GraphiqueAnalyse })))

export const ICONES_VISUEL: Record<TypeVisuel, LucideIcon> = {
  valeur: Hash,
  barres: ChartColumn,
  courbe: ChartLine,
  aire: ChartArea,
  secteurs: ChartPie,
  nuage: ChartScatter,
  tableau: Table2,
  texte: Type,
  entete: PanelTop,
  compte_a_rebours: Timer,
  etapes: ChartGantt,
  liste: List,
  repartition: ChartBarStacked,
  frise: CalendarRange,
}

/** Blocs des fiches : une carte à la hauteur de son contenu, titre en petites capitales. */
export const TYPES_FICHE: ReadonlySet<TypeVisuel> = new Set(['entete', 'compte_a_rebours', 'etapes', 'liste', 'repartition', 'frise'])

export type EtatAnalyse = { calcul: 'inactif' | 'en_cours' | 'pret'; resultats: ResultatsAnalyse | null; erreur: string | null }

/** Blocs d'analyse d'un dashboard, avec leur place `rangée.bloc`. */
export const blocsAnalyse = (d: Dashboard) => d.rangees.flatMap((r, i) => r.blocs.flatMap((bloc, j) => (estAnalyse(bloc) ? [{ place: `${i}.${j}`, bloc }] : [])))

/**
 * Résultats de l'analyse d'un dashboard, recalculés quand les bases, les
 * filtres, les paramètres ou les requêtes changent. Les résultats précédents
 * restent affichés pendant un recalcul.
 */
export function useAnalyse(d: Dashboard | null, retenues: ReadonlyMap<string, ReadonlySet<string>>): EtatAnalyse {
  const { etat } = useEspace()
  const aujourdhui = useAujourdhui()
  const [analyse, setAnalyse] = useState<EtatAnalyse>({ calcul: 'inactif', resultats: null, erreur: null })
  const blocs = useMemo(() => (d ? blocsAnalyse(d) : []), [d])
  const actif = !!d && (Object.keys(d.requetes).length > 0 || blocs.length > 0)

  useEffect(() => {
    if (!d || !actif) return
    let annule = false
    setAnalyse((a) => ({ ...a, calcul: 'en_cours' }))
    void sessionSql.executer(etat, retenues, () => tablesSql(sourceDe(etat), retenues), (m) => (annule ? Promise.resolve(null) : executerAnalyse(m, { requetes: d.requetes, parametres: d.parametres, blocs, etats: d.etats }, aujourdhui))).then(
      (resultats) => !annule && resultats && setAnalyse({ calcul: 'pret', resultats, erreur: null }),
      (e: unknown) => !annule && setAnalyse({ calcul: 'pret', resultats: null, erreur: `Moteur SQL indisponible : ${e instanceof Error ? e.message : String(e)}` }),
    )
    return () => {
      annule = true
    }
  }, [etat, retenues, d?.requetes, d?.parametres, d?.etats, blocs, aujourdhui, actif]) // eslint-disable-line react-hooks/exhaustive-deps

  return actif ? analyse : { calcul: 'inactif', resultats: null, erreur: null }
}

// ── Sélecteurs de ligne ──────────────────────────────────────────

const cleSelecteur = (dashboard: string) => `mdbase:selecteur:${dashboard}`

function lireSelecteurs(dashboard: string): Record<string, unknown> {
  try {
    const brut = JSON.parse(localStorage.getItem(cleSelecteur(dashboard)) ?? '{}') as unknown
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Choix des sélecteurs de ligne (paramètres `affichage: boutons`), retenus
 * sur cette machine et jamais écrits dans le fichier : changer de projet,
 * c'est consulter. Rend le dashboard avec ces choix comme valeurs, et de
 * quoi en changer.
 */
export function useSelecteurs(d: Dashboard | null): [Dashboard | null, (nom: string, valeur: unknown) => void] {
  const id = d?.id ?? ''
  const [choix, setChoix] = useState<{ id: string; valeurs: Record<string, unknown> }>(() => ({ id, valeurs: lireSelecteurs(id) }))
  const valeurs = choix.id === id ? choix.valeurs : lireSelecteurs(id)
  const effectif = useMemo(() => {
    if (!d || !d.parametres.some((p) => p.affichage === 'boutons')) return d
    return { ...d, parametres: d.parametres.map((p) => (p.affichage === 'boutons' && valeurs[p.nom] !== undefined ? { ...p, valeur: valeurs[p.nom] } : p)) }
  }, [d, valeurs])
  const choisir = (nom: string, valeur: unknown) => {
    const suivant = { ...valeurs, [nom]: valeur }
    if (valeur === null || valeur === undefined) delete suivant[nom]
    try {
      localStorage.setItem(cleSelecteur(id), JSON.stringify(suivant))
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite.
    }
    setChoix({ id, valeurs: suivant })
  }
  return [effectif, choisir]
}

/** Au-delà, le sélecteur devient une liste avec recherche. */
const BOUTONS_MAX = 12

function Selecteur({ parametre, dashboard, analyse, changer }: { parametre: Parametre; dashboard: Dashboard; analyse: EtatAnalyse; changer: (v: unknown) => void }) {
  const p = parametre
  const avecEtats = analyse.resultats?.options.get(p.nom)
  const source = avecEtats ?? (typeof p.options === 'string' ? analyse.resultats?.requetes.get(p.options) : undefined)
  const lignes = source?.ok ? source.resultat.lignes : []
  const entrees = p.pastille ? dashboard.etats[p.pastille] : undefined
  const options: { valeur: string; etat: EntreeEtat | undefined }[] = Array.isArray(p.options)
    ? p.options.map((valeur) => ({ valeur, etat: undefined }))
    : lignes.flatMap((l) => {
        const v = Object.values(l)[0]
        return v === null || v === undefined ? [] : [{ valeur: String(v), etat: etatDe(l, entrees) }]
      })
  const actuelle = p.valeur ?? p.defaut
  // Sans choix retenu ni défaut : la première option.
  useEffect(() => {
    if ((actuelle === undefined || actuelle === null) && options[0]) changer(options[0].valeur)
  }, [actuelle, options[0]?.valeur]) // eslint-disable-line react-hooks/exhaustive-deps
  if (source && !source.ok) return <ErreurRequete message={source.erreur} />
  if (options.length > BOUTONS_MAX) {
    return (
      <Choix
        libelle={p.libelle ?? p.nom}
        valeur={typeof actuelle === 'string' ? actuelle : ''}
        entrees={options.map((o) => ({ valeur: o.valeur, libelle: o.valeur }))}
        changer={(v) => changer(v)}
      />
    )
  }
  return (
    <div className="selecteur-ligne" role="radiogroup" aria-label={p.libelle ?? p.nom}>
      {options.map((o) => (
        <button key={o.valeur} role="radio" aria-checked={o.valeur === actuelle} className={o.valeur === actuelle ? 'actif' : ''} onClick={() => changer(o.valeur)} title={o.etat?.libelle}>
          {o.etat && <Point couleur={o.etat.couleur} />}
          {o.valeur}
        </button>
      ))}
    </div>
  )
}

// ── Captures ─────────────────────────────────────────────────────

const fondCapture = () => getComputedStyle(document.documentElement).getPropertyValue('--fond').trim() || '#fff'

export async function imageDe(el: HTMLElement): Promise<Blob> {
  el.classList.add('en-capture')
  try {
    const blob = await domToBlob(el, { scale: 2, backgroundColor: fondCapture(), type: 'image/png' })
    if (!blob) throw new Error('La capture a échoué')
    return blob
  } finally {
    el.classList.remove('en-capture')
  }
}

export async function copierImage(el: HTMLElement): Promise<void> {
  const blob = await imageDe(el)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function enregistrerImage(el: HTMLElement, nom: string): Promise<void> {
  const url = URL.createObjectURL(await imageDe(el))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nom.replace(/[\\/:*?"<>|]/g, '-').trim() || 'capture'}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Bloc ─────────────────────────────────────────────────────────

type PropsBloc = {
  dashboard: Dashboard
  place: PlaceBloc
  bloc: BlocAnalyse
  part: number
  glisse: boolean
  analyse: EtatAnalyse
  poignee: ReactNode
  modifier: (m: ModificationAnalyse) => void
  retirer: () => void
}

export function BlocAnalyseDashboard({ dashboard, place, bloc, part, glisse, analyse, poignee, modifier, retirer }: PropsBloc) {
  const lancer = useLancer()
  const lecture = useConsultation()
  const { etat } = useEspace()
  const [menu, setMenu] = useState(false)
  const [reglages, setReglages] = useState(false)
  const [renommage, setRenommage] = useState(false)
  const ancreMenu = useRef<HTMLButtonElement>(null)
  const ancreReglages = useRef<HTMLButtonElement>(null)
  const section = useRef<HTMLElement>(null)
  const schemas = useMemo(() => [...etat.bases.values()].flatMap((b) => (b.depot ? [b.depot.schema] : [])), [etat])
  const aujourdhui = useAujourdhui()
  const cle = `${place.rangee}.${place.bloc}`
  const etatRequete = analyse.resultats?.blocs.get(cle)
  const nom = nomAnalyse(bloc)
  const fiche = TYPES_FICHE.has(bloc.type)
  const requetes = analyse.resultats?.requetes
  const citerTitre = (t: string) => (requetes ? citer(t, requetes, (v) => formater(v as ValeurSql)) : t)
  const titre = bloc.type === 'entete' ? (lecture ? '' : 'En-tête de fiche') : citerTitre(bloc.titre ?? nom)
  const lisere = bloc.type === 'compte_a_rebours' ? lisereCompte(bloc, etatRequete?.ok ? etatRequete.resultat : undefined, aujourdhui) : undefined

  return (
    <section
      ref={section}
      className={`bloc-dashboard bloc-analyse ${fiche ? 'bloc-fiche' : ''} ${bloc.type === 'entete' ? 'bloc-entete' : ''} ${glisse ? 'glisse' : ''}`}
      style={{ flexGrow: part, ...(lisere && { borderLeft: `4px solid ${lisere}` }) }}
    >
      <div className="entete-bloc">
        {poignee}
        <Icone de={ICONES_VISUEL[bloc.type]} />
        {renommage ? (
          <input
            className="champ-en-ligne"
            autoFocus
            defaultValue={bloc.titre ?? ''}
            placeholder="Titre du bloc"
            onBlur={(e) => {
              setRenommage(false)
              const titre = e.target.value.trim()
              if (titre !== (bloc.titre ?? '')) modifier({ titre: titre || null })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setRenommage(false)
            }}
          />
        ) : (
          <span className="nom-vue-bloc" onDoubleClick={() => !lecture && setRenommage(true)} title={lecture ? undefined : 'Double-clic pour renommer'}>
            {titre}
          </span>
        )}
        {analyse.calcul === 'en_cours' && <Icone de={LoaderCircle} className="discret tourne" />}
        <span className="espaceur" />
        {!lecture && (
          <button ref={ancreReglages} className="discret" onClick={() => setReglages(true)} aria-label="Réglages du bloc" title="Réglages du bloc">
            <Icone de={SlidersHorizontal} />
          </button>
        )}
        <button ref={ancreMenu} className="discret" onClick={() => setMenu(true)} aria-label="Options du bloc">
          <Icone de={Ellipsis} />
        </button>
        {menu && (
          <Flottant ancre={ancreMenu.current} fermer={() => setMenu(false)}>
            <button className="option" onClick={() => (setMenu(false), section.current && void lancer(copierImage(section.current)))}>
              Copier l'image
            </button>
            <button className="option" onClick={() => (setMenu(false), section.current && void lancer(enregistrerImage(section.current, bloc.titre ?? nom)))}>
              Enregistrer l'image
            </button>
            {!lecture && (
              <>
                <button className="option" onClick={() => (setMenu(false), setRenommage(true))}>
                  Renommer
                </button>
                <button className="option danger-texte" onClick={() => (setMenu(false), retirer())}>
                  Retirer le bloc
                </button>
              </>
            )}
          </Flottant>
        )}
        {reglages && !lecture && (
          <Flottant ancre={ancreReglages.current} fermer={() => setReglages(false)} garderOuvert>
            <ReglagesBloc dashboard={dashboard} bloc={bloc} resultat={etatRequete?.ok ? etatRequete.resultat : undefined} modifier={modifier} />
          </Flottant>
        )}
      </div>
      <div className="contenu-bloc contenu-analyse">
        {analyse.erreur ? (
          <p className="erreur">{analyse.erreur}</p>
        ) : bloc.type === 'texte' ? (
          <TexteAnalyse bloc={bloc} requetes={analyse.resultats?.requetes} />
        ) : !etatRequete ? (
          <p className="discret">{analyse.calcul === 'en_cours' || analyse.calcul === 'inactif' ? 'Calcul…' : 'Aucune donnée : choisis une requête dans les réglages du bloc.'}</p>
        ) : !etatRequete.ok ? (
          <ErreurRequete message={etatRequete.erreur} />
        ) : (
          <ContenuAnalyse
            bloc={bloc}
            resultat={etatRequete.resultat}
            schemas={schemas}
            dashboard={dashboard}
            aujourdhui={aujourdhui}
            secondaires={(cle2) => {
              const r = analyse.resultats?.blocs.get(`${cle}/${cle2}`)
              return r?.ok ? r.resultat.lignes : []
            }}
            erreurSecondaire={(['jalons', 'periodes'] as const).map((c) => analyse.resultats?.blocs.get(`${cle}/${c}`)).find((r) => r && !r.ok)}
            citer={citerTitre}
          />
        )}
      </div>
    </section>
  )
}

function ErreurRequete({ message }: { message: string }) {
  return (
    <p className="erreur erreur-requete">
      <Icone de={TriangleAlert} /> {message}
    </p>
  )
}

type PropsContenu = {
  bloc: BlocAnalyse
  resultat: ResultatSql & { coupe: boolean }
  schemas: readonly Schema[]
  dashboard: Dashboard
  aujourdhui: string
  secondaires: (cle: 'jalons' | 'periodes') => Record<string, ValeurSql>[]
  erreurSecondaire: EtatRequete | undefined
  citer: (t: string) => string
}

function ContenuAnalyse({ bloc, resultat, schemas, dashboard, aujourdhui, secondaires, erreurSecondaire, citer }: PropsContenu) {
  const manquantes = colonnesManquantes(bloc, resultat, dashboard.etats)
  if (manquantes.length > 0) return <ErreurRequete message={`Colonne${manquantes.length > 1 ? 's' : ''} absente${manquantes.length > 1 ? 's' : ''} du résultat : ${manquantes.join(', ')}. Colonnes : ${resultat.colonnes.map((c) => c.nom).join(', ') || 'aucune'}.`} />
  const coupe = resultat.coupe && <p className="discret note-coupe">Résultat coupé à {resultat.lignes.length.toLocaleString('fr-FR')} lignes.</p>
  if (erreurSecondaire && !erreurSecondaire.ok) return <ErreurRequete message={erreurSecondaire.erreur} />
  if (bloc.type === 'valeur') return <ValeurCle bloc={bloc} resultat={resultat} />
  if (bloc.type === 'entete') return <EnteteFiche bloc={bloc} resultat={resultat} etats={dashboard.etats} citer={citer} />
  if (bloc.type === 'compte_a_rebours') return <CompteARebours bloc={bloc} resultat={resultat} aujourdhui={aujourdhui} />
  if (bloc.type === 'etapes') return <EtapesFiche bloc={bloc} resultat={resultat} tables={dashboard.couleurs} aujourdhui={aujourdhui} />
  if (bloc.type === 'liste') return <ListeFiche bloc={bloc} resultat={resultat} etats={dashboard.etats} tables={dashboard.couleurs} />
  if (bloc.type === 'repartition') return <Repartition bloc={bloc} resultat={resultat} tables={dashboard.couleurs} schemas={schemas} />
  if (bloc.type === 'frise') return <Frise bloc={bloc} resultat={resultat} jalons={secondaires('jalons')} periodes={secondaires('periodes')} tables={dashboard.couleurs} aujourdhui={aujourdhui} />
  if (bloc.type === 'tableau') {
    return (
      <>
        <TableauSql bloc={bloc} resultat={resultat} />
        {coupe}
      </>
    )
  }
  if (resultat.lignes.length === 0) return <p className="discret">Aucune ligne.</p>
  return (
    <>
      <Suspense fallback={<p className="discret">Chargement du graphique…</p>}>
        <GraphiqueAnalyse bloc={bloc} resultat={resultat} schemas={schemas} />
      </Suspense>
      {coupe}
    </>
  )
}

function ValeurCle({ bloc, resultat }: { bloc: BlocAnalyse; resultat: ResultatSql }) {
  const ligne = resultat.lignes[0]
  const colonne = bloc.valeur ?? resultat.colonnes.find((c) => c.nature === 'nombre')?.nom ?? resultat.colonnes[0]?.nom
  if (!ligne || !colonne) return <p className="discret">Aucune ligne.</p>
  const v = ligne[colonne]
  const format = formatDe(bloc.format, colonne)
  const couleur = couleurRegle(bloc.regles, ligne, (r) => r.colonne ?? colonne)
  const reference = bloc.comparer ? ligne[bloc.comparer] : undefined
  const ecart = typeof v === 'number' && typeof reference === 'number' ? v - reference : null
  return (
    <div className="valeur-cle">
      <div className="chiffre" style={couleur ? { color: teinte(couleur) } : undefined}>
        {formater(v, format) || '–'}
      </div>
      {ecart !== null && (
        <div className={`ecart ${ecart > 0 ? 'hausse' : ecart < 0 ? 'baisse' : ''}`}>
          {ecart !== 0 && <Icone de={ecart > 0 ? TrendingUp : TrendingDown} />}
          {ecart > 0 ? '+' : ''}
          {formater(ecart, format)}
          {typeof reference === 'number' && reference !== 0 && ` (${ecart > 0 ? '+' : ''}${formater(ecart / Math.abs(reference), 'pourcent')})`}
          <span className="discret"> vs {formater(reference, format)}</span>
        </div>
      )}
    </div>
  )
}

/** Fond d'une cellule colorée par une règle : pastel de la couleur de l'espace, ou teinte légère d'un hexadécimal. */
const fondRegle = (c: string) => (c.startsWith('#') ? `color-mix(in srgb, ${c} 18%, transparent)` : couleurOption(c).fond)
const texteRegle = (c: string) => (c.startsWith('#') ? undefined : couleurOption(c).texte)

function TableauSql({ bloc, resultat }: { bloc: BlocAnalyse; resultat: ResultatSql }) {
  const colonnes = bloc.colonnes ?? resultat.colonnes.map((c) => c.nom)
  const natures = new Map(resultat.colonnes.map((c) => [c.nom, c.nature]))
  if (resultat.lignes.length === 0) return <p className="discret">Aucune ligne.</p>
  return (
    <div className="tableau-sql">
      <table>
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c} className={natures.get(c) === 'nombre' ? 'nombre' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resultat.lignes.map((l, i) => {
            const couleurLigne = couleurRegle(bloc.regles, l, (r) => (r.ligne ? (r.colonne ?? colonnes[0]) : undefined))
            return (
              <tr key={i} style={couleurLigne ? { background: fondRegle(couleurLigne) } : undefined}>
                {colonnes.map((c) => {
                  const couleur = couleurRegle(bloc.regles, l, (r) => (!r.ligne && r.colonne === c ? c : undefined))
                  return (
                    <td key={c} className={natures.get(c) === 'nombre' ? 'nombre' : undefined} style={couleur ? { background: fondRegle(couleur), color: texteRegle(couleur) } : undefined}>
                      {formater(l[c] as ValeurSql, formatDe(bloc.format, c))}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TexteAnalyse({ bloc, requetes }: { bloc: BlocAnalyse; requetes: ReadonlyMap<string, EtatRequete> | undefined }) {
  const texte = bloc.texte ?? ''
  if (!texte.trim()) return <p className="discret">Bloc de texte vide : écris-le dans ses réglages.</p>
  const cite = requetes ? citer(texte, requetes, (v) => formater(v as ValeurSql, typeof bloc.format === 'string' ? bloc.format : undefined)) : texte
  return <ContenuMarkdown texte={cite} className="texte-analyse" />
}

// ── Paramètres ───────────────────────────────────────────────────

/** Les paramètres du dashboard, réglables en haut comme des filtres rapides ; un choix s'écrit dans le fichier. */
export function ParametresDashboard({ dashboard, analyse, changer, choisir }: { dashboard: Dashboard; analyse: EtatAnalyse; changer: (nom: string, valeur: unknown) => void; choisir: (nom: string, valeur: unknown) => void }) {
  if (dashboard.parametres.length === 0) return null
  const selecteurs = dashboard.parametres.filter((p) => p.affichage === 'boutons' && p.type === 'choix')
  const autres = dashboard.parametres.filter((p) => !selecteurs.includes(p))
  return (
    <>
      {selecteurs.map((p) => (
        <Selecteur key={p.nom} parametre={p} dashboard={dashboard} analyse={analyse} changer={(v) => choisir(p.nom, v)} />
      ))}
      {autres.length > 0 && (
        <div className="parametres-dashboard">
          {autres.map((p) => {
            const actuelle = p.valeur ?? p.defaut
            const libelle = p.libelle ?? p.nom
            const texte = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
            let champ: ReactNode
            if (p.type === 'choix') {
              const source = typeof p.options === 'string' ? analyse.resultats?.requetes.get(p.options) : undefined
              const options = Array.isArray(p.options)
                ? p.options
                : source?.ok
                  ? [...new Set(source.resultat.lignes.map((l) => Object.values(l)[0]).filter((v) => v !== null && v !== undefined).map(String))]
                  : []
              champ = (
                <Choix libelle={libelle} valeur={texte(actuelle)} vide="(tous)" entrees={[{ valeur: '', libelle: '(tous)' }, ...options.map((o) => ({ valeur: o, libelle: o }))]} changer={(v) => changer(p.nom, v || null)} />
              )
            } else if (p.type === 'mois') {
              const aujourdhui = new Date()
              const courant = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}`
              const precedent = (() => {
                const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - 1, 1)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              })()
              const v = actuelle === 'courant' ? courant : actuelle === 'precedent' ? precedent : texte(actuelle)
              champ = <input type="month" aria-label={libelle} value={v} onChange={(e) => changer(p.nom, e.target.value || null)} />
            } else if (p.type === 'periode') {
              const [debut, fin] = Array.isArray(actuelle) ? actuelle.map(texte) : ['', '']
              champ = (
                <>
                  <input type="date" aria-label={`${libelle} : début`} value={debut ?? ''} onChange={(e) => changer(p.nom, [e.target.value || null, fin || null])} />
                  <span className="discret">au</span>
                  <input type="date" aria-label={`${libelle} : fin`} value={fin ?? ''} onChange={(e) => changer(p.nom, [debut || null, e.target.value || null])} />
                </>
              )
            } else {
              const type = p.type === 'nombre' ? 'number' : p.type === 'date' ? 'date' : 'text'
              champ = (
                <input
                  key={texte(actuelle)}
                  type={type}
                  aria-label={libelle}
                  defaultValue={texte(actuelle)}
                  onBlur={(e) => {
                    const brut = e.target.value
                    const v = brut === '' ? null : p.type === 'nombre' ? Number(brut) : brut
                    if (v !== (actuelle ?? null)) changer(p.nom, v)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              )
            }
            return (
              <label key={p.nom} className="parametre-dashboard">
                <span>{libelle}</span>
                {champ}
              </label>
            )
          })}
        </div>
      )}
    </>
  )
}
