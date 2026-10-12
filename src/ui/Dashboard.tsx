import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as PointerReact, type ReactNode } from 'react'
import { DndContext, DragOverlay, MeasuringStrategy, pointerWithin, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { BLOCS_PAR_RANGEE, estAnalyse, estPropre, HAUTEUR_BLOC, hauteurBornee, LARGEUR_BLOC, partsRangee, type Bloc, type BlocVue, type Dashboard, type OperationDashboard, type PlaceBloc } from '../core/dashboard'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace, EtatDashboard } from '../core/depot-espace'
import { idBase } from '../core/identifiants'
import type { Schema } from '../core/schema'
import type { ModificationVue, TypeVue, Vue } from '../core/vue'
import { vueParDefaut } from '../core/vue'
import { useLancer } from './actions'
import { OutilsVue, reglagesParDefaut, TYPES_CREABLES } from './BarreVue'
import { Icone, ICONES_VUES } from './icones'
import { ContenuVue, useVueAppliquee } from './ContenuVue'
import { useEspace } from './contexte-espace'
import { Flottant } from './flottant'
import { Page } from './Page'
import { Pastilles } from './Pastilles'
import { FiltresDashboard, useRetenues } from './FiltresDashboard'
import { filtrerBloc } from '../core/filtre-global'
import { usePageOuverte } from './usePageOuverte'
import { DonneesDe, useConsultation } from './mode'
import { ArrowDown, ArrowUp, ChevronRight, Database, Ellipsis, GripVertical, ImageDown, Plus, TriangleAlert } from 'lucide-react'
import { nomAnalyse, type BlocAnalyse, type TypeVisuel } from '../core/bi/analyse'
import { BlocAnalyseDashboard, enregistrerImage, ICONES_VISUEL, ParametresDashboard, useAnalyse } from './Analyse'
import { FenetreAnalyse } from './ReglagesAnalyse'

const SANS_FILTRES: Dashboard = { id: '', nom: '', rangees: [], filtres: [], filtresRapides: [], requetes: {}, parametres: [] }

type Props = {
  espace: DepotEspace
  etat: EtatDashboard
  /** Ouvre une base dans la zone principale. */
  allerABase: (base: string) => void
}

/**
 * Dashboard (spec §10) : rangées empilées d'un ou deux blocs, chacun une vue
 * d'une base. Une ligne s'ouvre dans le panneau de page, comme depuis sa base.
 */
export function VueDashboard({ espace, etat, allerABase }: Props) {
  const lancer = useLancer()
  const { page, ouvrir, pleinEcran, basculerPleinEcran, fermer } = usePageOuverte(null)
  const [edition, setEdition] = useState(false)
  const lecture = useConsultation()
  const d = etat.dashboard
  const modifier = (op: Parameters<DepotEspace['modifierDashboard']>[1]) => void lancer(espace.modifierDashboard(etat.id, op))
  const retenues = useRetenues(d ?? SANS_FILTRES)
  const analyse = useAnalyse(d, retenues)
  const [fenetreAnalyse, setFenetreAnalyse] = useState(false)
  const zone = useRef<HTMLDivElement>(null)
  const [glisse, setGlisse] = useState<Glisse | null>(null)
  const capteurs = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (!d) {
    return (
      <div className="zone-tableau">
        <p className="erreur">Dashboard « {etat.id} » illisible : {etat.avertissements.join(' ; ')}</p>
      </div>
    )
  }
  // Identifiants des vues propres, pour en créer une nouvelle sans doublon.
  const idsPropres = d.rangees.flatMap((r) => r.blocs.flatMap((b) => (estPropre(b) ? [b.vue.id] : [])))
  const deposer = (e: DragEndEvent) => {
    setGlisse(null)
    const de = e.active.data.current as Glisse | undefined
    const vers = e.over?.data.current as Fente | undefined
    const op = de && vers && operationDeDepot(de, vers)
    if (op) modifier(op)
  }

  return (
    <div className={`zone-vue ${page ? 'avec-page' : ''} ${pleinEcran ? 'page-plein-ecran' : ''}`}>
      <div ref={zone} className="zone-tableau zone-dashboard">
        <div className="titre-et-outils-dashboard">
        {edition ? (
          <input
            className="champ-en-ligne titre-dashboard"
            autoFocus
            defaultValue={d.nom}
            onBlur={(e) => {
              setEdition(false)
              const nom = e.target.value.trim()
              if (nom && nom !== d.nom) modifier({ type: 'renommer', nom })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEdition(false)
            }}
          />
        ) : (
          <h1 onDoubleClick={() => !lecture && setEdition(true)} title={lecture ? undefined : 'Double-clic pour renommer'}>
            {d.nom}
          </h1>
        )}
          <span className="espaceur" />
          {!lecture && (
            <button className="discret" onClick={() => setFenetreAnalyse(true)} title="Requêtes SQL et paramètres du dashboard">
              <Icone de={Database} /> Requêtes
            </button>
          )}
          <button
            className="discret"
            onClick={() => zone.current && void lancer(enregistrerImage(zone.current, d.nom))}
            title="Le dashboard entier en image PNG, filtres et paramètres réglés compris"
          >
            <Icone de={ImageDown} /> Exporter en image
          </button>
        </div>
        {fenetreAnalyse && <FenetreAnalyse dashboard={d} resultats={analyse.resultats} modifier={modifier} fermer={() => setFenetreAnalyse(false)} />}
        {etat.avertissements.length > 0 && (
          <details className="avertissements">
            <summary>
              <Icone de={TriangleAlert} className="alerte" />
              {etat.avertissements.length} signalement(s)
            </summary>
            <ul>
              {etat.avertissements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}
        <FiltresDashboard
          dashboard={d}
          changerFiltres={(filtres) => modifier({ type: 'filtres', filtres })}
          changerPastilles={(pastilles) => modifier({ type: 'filtres_rapides', pastilles })}
        />
        <ParametresDashboard dashboard={d} analyse={analyse} changer={(nom, valeur) => modifier({ type: 'valeur_parametre', nom, valeur })} />
        {d.rangees.length === 0 && <p className="discret">Dashboard vide : ajoute un premier bloc, une vue d'une de tes bases.</p>}
        <DndContext
          sensors={capteurs}
          collisionDetection={pointerWithin}
          // Les fentes n'apparaissent qu'une fois le glisser commencé : mesurées en continu.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          autoScroll={{ threshold: { x: 0, y: 0.08 } }} // 20 % par défaut : la fente de tête suffisait à faire défiler
          onDragStart={(e) => setGlisse(e.active.data.current as Glisse)}
          onDragEnd={deposer}
          onDragCancel={() => setGlisse(null)}
        >
          {d.rangees.map((r, i) => {
            const parts = partsRangee(r.blocs)
            return (
              <div key={i} className="rangee-dashboard-place">
                <FenteRangee rang={i} glisse={glisse} />
                <div className={`rangee-dashboard ${glisse?.type === 'rangee' && glisse.rangee === i ? 'glissee' : ''}`} style={{ '--hauteur-bloc': `${r.hauteur ?? HAUTEUR_BLOC.defaut}px` } as CSSProperties}>
                  {!lecture && (
                    <div className="deplacer-rangee">
                      <PoigneeGlisse id={`rangee-${i}`} donnees={{ type: 'rangee', rangee: i }} libelle={`Déplacer la rangée ${i + 1}`} />
                      <button className="discret" disabled={i === 0} onClick={() => modifier({ type: 'deplacer_rangee', de: i, vers: i - 1 })} aria-label="Monter la rangée">
                        <Icone de={ArrowUp} />
                      </button>
                      <button
                        className="discret"
                        disabled={i === d.rangees.length - 1}
                        onClick={() => modifier({ type: 'deplacer_rangee', de: i, vers: i + 1 })}
                        aria-label="Descendre la rangée"
                      >
                        <Icone de={ArrowDown} />
                      </button>
                    </div>
                  )}
                  {r.blocs.flatMap((b, j) => [
                    <FenteBloc key={`fente-${j}`} rangee={i} position={j} taille={r.blocs.length} glisse={glisse} />,
                    j > 0 && !lecture && <PoigneeLargeur key={`largeur-${j}`} changer={(largeurs) => modifier({ type: 'largeurs_rangee', rangee: i, largeurs })} />,
                    estAnalyse(b) ? (
                      <BlocAnalyseDashboard
                        key={`analyse/${j}`}
                        dashboard={d}
                        place={{ rangee: i, bloc: j }}
                        bloc={b}
                        part={parts[j]!}
                        glisse={glisse?.type === 'bloc' && glisse.place.rangee === i && glisse.place.bloc === j}
                        analyse={analyse}
                        poignee={!lecture && <PoigneeGlisse id={`bloc-${i}-${j}`} donnees={{ type: 'bloc', place: { rangee: i, bloc: j } }} libelle={`Déplacer le bloc ${nomAnalyse(b)}`} />}
                        modifier={(modifs) => modifier({ type: 'modifier_analyse', place: { rangee: i, bloc: j }, modifs })}
                        retirer={() => modifier({ type: 'retirer_bloc', place: { rangee: i, bloc: j } })}
                      />
                    ) : (
                    <BlocDashboard
                      key={`${b.base}/${estPropre(b) ? `propre:${b.vue.id}` : b.vue}/${j}`}
                      espace={espace}
                      idDashboard={etat.id}
                      place={{ rangee: i, bloc: j }}
                      bloc={b}
                      part={parts[j]!}
                      glisse={glisse?.type === 'bloc' && glisse.place.rangee === i && glisse.place.bloc === j}
                      idsPropres={idsPropres}
                      remplacer={(bloc) => modifier({ type: 'remplacer_bloc', place: { rangee: i, bloc: j }, bloc })}
                      ouvrir={ouvrir}
                      allerABase={allerABase}
                      retenues={retenues}
                      retirer={() => modifier({ type: 'retirer_bloc', place: { rangee: i, bloc: j } })}
                    />
                    ),
                  ])}
                  <FenteBloc rangee={i} position={r.blocs.length} taille={r.blocs.length} glisse={glisse} />
                  {r.blocs.length < BLOCS_PAR_RANGEE && !lecture && (
                    <AjoutBloc idsPropres={idsPropres} requetes={Object.keys(d.requetes)} ajouter={(bloc) => modifier({ type: 'ajouter_bloc', rangee: i, bloc })} compact />
                  )}
                  {!lecture && <PoigneeHauteur changer={(hauteur) => modifier({ type: 'hauteur_rangee', rangee: i, hauteur })} />}
                </div>
              </div>
            )
          })}
          <FenteRangee rang={d.rangees.length} glisse={glisse} />
          <DragOverlay dropAnimation={null}>{glisse && <ApercuGlisse dashboard={d} glisse={glisse} />}</DragOverlay>
        </DndContext>
        {!lecture && <AjoutBloc idsPropres={idsPropres} requetes={Object.keys(d.requetes)} ajouter={(bloc) => modifier({ type: 'ajouter_bloc', rangee: null, bloc })} />}
      </div>
      {page && (
        <Page
          key={`${page.base}/${page.id}`}
          base={page.base}
          id={page.id}
          pleinEcran={pleinEcran}
          basculerPleinEcran={basculerPleinEcran}
          fermer={fermer}
          ouvrir={ouvrir}
        />
      )}
    </div>
  )
}

type PropsBloc = {
  espace: DepotEspace
  idDashboard: string
  place: PlaceBloc
  bloc: BlocVue
  /** Part de la rangée (`flex-grow`), d'après les largeurs réglées. */
  part: number
  /** Le bloc est en train d'être glissé : il s'estompe à sa place. */
  glisse: boolean
  idsPropres: string[]
  remplacer: (b: Bloc) => void
  ouvrir: (base: string, id: string) => void
  allerABase: (base: string) => void
  /** Lignes retenues par les filtres globaux, par base filtrée. */
  retenues: ReadonlyMap<string, ReadonlySet<string>>
  retirer: () => void
}

/** Un bloc : sa base et sa vue doivent exister, sinon il le dit et peut être retiré. */
function BlocDashboard(p: PropsBloc) {
  const { etat } = useEspace()
  const lecture = useConsultation()
  const etatBase = etat.bases.get(p.bloc.base)
  const depot = etatBase?.depot
  const vue = estPropre(p.bloc) ? p.bloc.vue : etatBase?.vues.find((v) => v.id === p.bloc.vue)
  if (!depot || !vue) {
    return (
      <section className="bloc-dashboard bloc-casse" style={{ flexGrow: p.part }}>
        <p className="erreur">
          {!depot ? `Base « ${p.bloc.base} » introuvable` : `Vue « ${String(p.bloc.vue)} » introuvable dans ${depot.schema.nom}`}
        </p>
        {!lecture && <button onClick={p.retirer}>Retirer le bloc</button>}
      </section>
    )
  }
  return <BlocVue {...p} depot={depot} vue={vue} />
}

function BlocVue({ espace, idDashboard, place, bloc, part, glisse, idsPropres, remplacer, depot, vue, ouvrir, allerABase, retenues, retirer }: PropsBloc & { depot: DepotBase; vue: Vue }) {
  const lancer = useLancer()
  const { etat } = useEspace()
  const deLaVue = useVueAppliquee(bloc.base, depot, vue)
  // Filtres globaux du dashboard, par-dessus ceux de la vue.
  const filtre = useMemo(() => filtrerBloc(bloc.base, depot.schema, deLaVue.lignesVue, retenues), [bloc.base, depot.schema, deLaVue.lignesVue, retenues])
  const appliquee = { ...deLaVue, lignesVue: filtre.lignes }
  const libres = filtre.libres.map((b) => etat.bases.get(b)?.depot?.schema.nom ?? b)
  const [menu, setMenu] = useState(false)
  const [renommage, setRenommage] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  const lecture = useConsultation()
  const propre = estPropre(bloc)
  // Vue propre : écrite dans le dashboard. Référence : dans le fichier de la vue, partagé avec la base.
  const modifierVue = (m: ModificationVue) =>
    void lancer(propre ? espace.modifierDashboard(idDashboard, { type: 'modifier_vue', place, modifs: m }) : espace.modifierVue(bloc.base, vue.id, m))

  return (
    <section className={`bloc-dashboard ${glisse ? 'glisse' : ''}`} style={{ flexGrow: part }}>
      <div className="entete-bloc">
        {!lecture && <PoigneeGlisse id={`bloc-${place.rangee}-${place.bloc}`} donnees={{ type: 'bloc', place }} libelle={`Déplacer le bloc ${depot.schema.nom} › ${vue.nom}`} />}
        <Icone de={ICONES_VUES[vue.type]} />
        <button className="discret lien-base" onClick={() => allerABase(bloc.base)} title="Ouvrir la base">
          {depot.schema.nom}
        </button>
        <Icone de={ChevronRight} className="discret" />
        {renommage ? (
          <input
            className="champ-en-ligne"
            autoFocus
            defaultValue={vue.nom}
            onBlur={(e) => {
              setRenommage(false)
              const nom = e.target.value.trim()
              if (nom && nom !== vue.nom) modifierVue({ nom })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setRenommage(false)
            }}
          />
        ) : (
          <span className="nom-vue-bloc" onDoubleClick={() => propre && !lecture && setRenommage(true)} title={propre && !lecture ? 'Double-clic pour renommer' : undefined}>
            {vue.nom}
          </span>
        )}
        {!lecture && (
          <span className={`etiquette-bloc ${propre ? 'propre' : ''}`} title={propre ? 'Vue écrite dans ce dashboard' : 'Vue de la base : la modifier ici la modifie aussi dans la base'}>
            {propre ? 'vue propre' : 'vue de la base'}
          </span>
        )}
        {libres.length > 0 && (
          <span className="discret non-filtre" title={`Ce bloc n'a pas de relation vers ${libres.join(', ')} : les filtres du dashboard sur cette base ne le touchent pas`}>
            non filtré par {libres.join(', ')}
          </span>
        )}
        <span className="espaceur" />
        {!lecture && (
          <>
            <OutilsVue schema={depot.schema} vue={vue} modifier={modifierVue} />
            <button ref={ancre} className="discret" onClick={() => setMenu(true)} aria-label="Options du bloc">
              <Icone de={Ellipsis} />
            </button>
          </>
        )}
        {menu && !lecture && (
          <Flottant ancre={ancre.current} fermer={() => setMenu(false)}>
            <button className="option" onClick={() => (setMenu(false), allerABase(bloc.base))}>
              Ouvrir la base {depot.schema.nom}
            </button>
            {propre && (
              <button className="option" onClick={() => (setMenu(false), setRenommage(true))}>
                Renommer la vue
              </button>
            )}
            {propre ? (
              <button
                className="option"
                title="La vue rejoint les onglets de la base ; le bloc la montre désormais"
                onClick={() => {
                  setMenu(false)
                  const { id: _i, nom, type, implicite: _x, ...reglages } = vue
                  void lancer(espace.creerVue(bloc.base, nom, type, reglages).then((id) => remplacer({ base: bloc.base, vue: id })))
                }}
              >
                Enregistrer comme vue de la base
              </button>
            ) : (
              <button
                className="option"
                title="Une copie écrite dans ce dashboard : la modifier ne touche plus la base"
                onClick={() => {
                  setMenu(false)
                  const copie: Vue = { ...vue, id: idBase(vue.nom, idsPropres) }
                  delete copie.implicite
                  remplacer({ base: bloc.base, vue: copie })
                }}
              >
                Copier en vue propre
              </button>
            )}
            <button className="option danger-texte" onClick={() => (setMenu(false), retirer())}>
              Retirer le bloc
            </button>
          </Flottant>
        )}
      </div>
      <Pastilles schema={depot.schema} pastilles={vue.filtresRapides} changer={(filtresRapides) => modifierVue({ filtresRapides })} />
      <div className="contenu-bloc">
        <DonneesDe schema={depot.schema}>
          <ContenuVue
            espace={espace}
            base={bloc.base}
            depot={depot}
            vue={vue}
            modifierVue={modifierVue}
            appliquee={appliquee}
            ouvrir={ouvrir}
          />
        </DonneesDe>
      </div>
    </section>
  )
}

const LIBELLES_ANALYSE: { type: TypeVisuel; nom: string }[] = [
  { type: 'valeur', nom: 'Chiffre clé' },
  { type: 'barres', nom: 'Barres' },
  { type: 'courbe', nom: 'Courbe' },
  { type: 'aire', nom: 'Aire' },
  { type: 'secteurs', nom: 'Secteurs' },
  { type: 'nuage', nom: 'Nuage de points' },
  { type: 'tableau', nom: 'Tableau SQL' },
  { type: 'texte', nom: 'Texte' },
]

/**
 * Bloc d'analyse de départ : la première requête du dashboard, sinon une
 * requête propre qui montre déjà quelque chose de la première base.
 */
function analyseParDefaut(type: TypeVisuel, requetes: string[], schema: Schema | undefined): BlocAnalyse {
  if (type === 'texte') return { type, texte: 'Texte libre en Markdown. Cite un résultat avec {{requete.colonne}}.' }
  if (requetes[0]) return { type, donnees: requetes[0] }
  if (!schema) return { type, sql: 'select 1 as valeur' }
  const table = /^[a-z_][a-z0-9_]*$/.test(schema.id) ? schema.id : `"${schema.id}"`
  if (type === 'valeur') return { type, titre: schema.nom, sql: `select count(*) as total from ${table}` }
  if (type === 'tableau') return { type, titre: schema.nom, sql: `select * from ${table}` }
  const choix = schema.colonnes.find((c) => c.type === 'select')
  if (!choix) return { type, sql: `select count(*) as total from ${table}` }
  return { type, titre: `${schema.nom} par ${choix.nom.toLowerCase()}`, sql: `select ${choix.cle}, count(*) as n\nfrom ${table}\ngroup by ${choix.cle}\norder by n desc` }
}

/** Ajout d'un bloc : une base, puis une de ses vues ou une vue propre au dashboard ; ou un bloc d'analyse. */
function AjoutBloc({ idsPropres, requetes, ajouter, compact }: { idsPropres: string[]; requetes: string[]; ajouter: (b: Bloc) => void; compact?: boolean }) {
  const { etat } = useEspace()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [base, setBase] = useState<string | null>(null)
  const fermer = () => {
    setOuvert(false)
    setBase(null)
  }
  const schema = base ? etat.bases.get(base)?.depot?.schema : undefined
  const bases = [...etat.bases.values()].filter((b) => b.depot)

  const creerPropre = (type: TypeVue, nom: string) => {
    if (!base || !schema) return
    const libelle = `${nom} ${schema.nom}`
    const vue: Vue = { ...vueParDefaut(), ...reglagesParDefaut(type, schema), id: idBase(libelle, idsPropres), nom: libelle, type }
    delete vue.implicite
    ajouter({ base, vue })
    fermer()
  }

  return (
    <>
      <button ref={ancre} className={`discret ajout-bloc ${compact ? 'compact' : ''}`} onClick={() => setOuvert(true)} title="Ajouter un bloc">
        {compact ? <Icone de={Plus} /> : <><Icone de={Plus} /> Ajouter un bloc</>}
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer}>
          {!base ? (
            <>
              <div className="option discret">Vue de quelle base ?</div>
              {bases.map((b) => (
                <button key={b.id} className="option" onClick={() => setBase(b.id)}>
                  {b.depot!.schema.nom}
                </button>
              ))}
              <div className="option discret">Ou un bloc d'analyse (SQL) :</div>
              {LIBELLES_ANALYSE.map((t) => (
                <button
                  key={t.type}
                  className="option"
                  onClick={() => {
                    ajouter(analyseParDefaut(t.type, requetes, bases[0]?.depot?.schema))
                    fermer()
                  }}
                >
                  <Icone de={ICONES_VISUEL[t.type]} />
                  {t.nom}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="option discret">Une vue de {schema?.nom} :</div>
              {etat.bases.get(base)!.vues.map((v) => (
                <button
                  key={v.id}
                  className="option"
                  onClick={() => {
                    ajouter({ base, vue: v.id })
                    fermer()
                  }}
                >
                  <Icone de={ICONES_VUES[v.type]} />
                  {v.nom}
                </button>
              ))}
              <div className="option discret">Ou une vue propre à ce dashboard :</div>
              {TYPES_CREABLES.map((t) => (
                <button key={t.type} className="option" onClick={() => creerPropre(t.type, t.nom)}>
                  <Icone de={ICONES_VUES[t.type]} />
                  {t.nom}
                </button>
              ))}
            </>
          )}
        </Flottant>
      )}
    </>
  )
}

/**
 * Bord bas d'une rangée : tirer règle la hauteur de ses blocs (la rangée suit le
 * pointeur, le fichier n'est écrit qu'au relâcher) ; un double-clic revient à
 * la hauteur par défaut.
 */
function PoigneeHauteur({ changer }: { changer: (hauteur: number | null) => void }) {
  const commencer = (e: PointerReact<HTMLDivElement>) => {
    const rangee = e.currentTarget.parentElement
    const contenu = rangee?.querySelector<HTMLElement>('.contenu-bloc')
    if (!rangee || !contenu) return
    e.preventDefault()
    const depart = { y: e.clientY, hauteur: contenu.getBoundingClientRect().height }
    let hauteur = depart.hauteur
    const suivre = (ev: PointerEvent) => {
      hauteur = hauteurBornee(depart.hauteur + ev.clientY - depart.y) ?? depart.hauteur
      rangee.style.setProperty('--hauteur-bloc', `${hauteur}px`)
    }
    const finir = () => {
      window.removeEventListener('pointermove', suivre)
      window.removeEventListener('pointerup', finir)
      document.body.classList.remove('redimensionne-hauteur')
      if (Math.round(hauteur) !== Math.round(depart.hauteur)) changer(hauteur)
    }
    document.body.classList.add('redimensionne-hauteur')
    window.addEventListener('pointermove', suivre)
    window.addEventListener('pointerup', finir)
  }
  return <div className="poignee-hauteur" role="separator" aria-orientation="horizontal" aria-label="Hauteur de la rangée" title="Tirer pour changer la hauteur ; double-clic : hauteur par défaut" onPointerDown={commencer} onDoubleClick={() => changer(null)} />
}

/** Ce qui se glisse : un bloc par sa poignée, ou une rangée entière. */
type Glisse = { type: 'bloc'; place: PlaceBloc } | { type: 'rangee'; rangee: number }
/** Où ça se dépose : entre deux rangées, ou à une place d'une rangée. */
type Fente = { type: 'entre'; rang: number } | { type: 'dans'; rangee: number; position: number }

/** L'opération d'un dépôt ; rien si le dépôt ne change rien. */
export function operationDeDepot(g: Glisse, f: Fente): OperationDashboard | null {
  if (g.type === 'rangee') {
    if (f.type !== 'entre' || f.rang === g.rangee || f.rang === g.rangee + 1) return null
    return { type: 'deplacer_rangee', de: g.rangee, vers: f.rang > g.rangee ? f.rang - 1 : f.rang }
  }
  if (f.type === 'entre') return { type: 'deplacer_bloc', de: g.place, vers: { nouvelleRangee: f.rang } }
  if (f.rangee === g.place.rangee && (f.position === g.place.bloc || f.position === g.place.bloc + 1)) return null
  return { type: 'deplacer_bloc', de: g.place, vers: { rangee: f.rangee, position: f.position } }
}

function PoigneeGlisse({ id, donnees, libelle }: { id: string; donnees: Glisse; libelle: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id, data: donnees })
  return (
    <button ref={setNodeRef} className="discret poignee-glisse" {...attributes} {...listeners} aria-label={libelle} title="Glisser pour déplacer">
      <Icone de={GripVertical} taille={14} />
    </button>
  )
}

/** Fente entre deux rangées : un bloc y crée une rangée, une rangée s'y range. */
function FenteRangee({ rang, glisse }: { rang: number; glisse: Glisse | null }) {
  const inutile = !glisse || (glisse.type === 'rangee' && (rang === glisse.rangee || rang === glisse.rangee + 1))
  const { setNodeRef, isOver } = useDroppable({ id: `entre-${rang}`, data: { type: 'entre', rang } satisfies Fente, disabled: inutile })
  // Toujours dans la page (inerte hors glisser) : dnd-kit ne mesure pas une cible apparue en cours de geste.
  return <div ref={setNodeRef} className={`fente-rangee ${inutile ? 'inactive' : ''} ${isOver ? 'survolee' : ''}`} aria-hidden />
}

/** Fente à une place d'une rangée, pour un bloc ; inactive si la rangée est pleine ou si le dépôt ne changerait rien. */
function FenteBloc({ rangee, position, taille, glisse }: { rangee: number; position: number; taille: number; glisse: Glisse | null }) {
  const memeRangee = glisse?.type === 'bloc' && glisse.place.rangee === rangee
  const inutile =
    glisse?.type !== 'bloc' || (memeRangee ? position === glisse.place.bloc || position === glisse.place.bloc + 1 : taille >= BLOCS_PAR_RANGEE)
  const { setNodeRef, isOver } = useDroppable({ id: `dans-${rangee}-${position}`, data: { type: 'dans', rangee, position } satisfies Fente, disabled: inutile })
  return <div ref={setNodeRef} className={`fente-bloc ${inutile ? 'inactive' : ''} ${isOver ? 'survolee' : ''}`} aria-hidden />
}

function ApercuGlisse({ dashboard, glisse }: { dashboard: Dashboard; glisse: Glisse }) {
  const { etat } = useEspace()
  const nom = (b: Bloc) => {
    if (estAnalyse(b)) return b.titre ?? nomAnalyse(b)
    const base = etat.bases.get(b.base)
    const vue = estPropre(b) ? b.vue.nom : (base?.vues.find((v) => v.id === b.vue)?.nom ?? b.vue)
    return `${base?.depot?.schema.nom ?? b.base} › ${vue}`
  }
  let contenu: ReactNode
  if (glisse.type === 'rangee') contenu = `Rangée ${glisse.rangee + 1} : ${dashboard.rangees[glisse.rangee]?.blocs.map(nom).join(', ') ?? ''}`
  else {
    const b = dashboard.rangees[glisse.place.rangee]?.blocs[glisse.place.bloc]
    contenu = b ? nom(b) : ''
  }
  return <div className="apercu-glisse">{contenu}</div>
}

/**
 * Séparation entre deux blocs d'une rangée : tirer règle leur part (les blocs
 * suivent le pointeur, le fichier n'est écrit qu'au relâcher, en pourcentages
 * de tous les blocs de la rangée) ; un double-clic revient aux parts égales.
 */
function PoigneeLargeur({ changer }: { changer: (largeurs: (number | null)[]) => void }) {
  const commencer = (e: PointerReact<HTMLDivElement>) => {
    const voisin = (sens: 'previousElementSibling' | 'nextElementSibling') => {
      let x = e.currentTarget[sens]
      while (x && !x.classList.contains('bloc-dashboard')) x = x[sens]
      return x
    }
    const gauche = voisin('previousElementSibling')
    const droite = voisin('nextElementSibling')
    const rangee = e.currentTarget.parentElement
    if (!(gauche instanceof HTMLElement) || !(droite instanceof HTMLElement) || !rangee) return
    e.preventDefault()
    const blocs = [...rangee.querySelectorAll<HTMLElement>(':scope > .bloc-dashboard')]
    const largeurs = blocs.map((b) => b.getBoundingClientRect().width)
    const total = largeurs.reduce((a, x) => a + x, 0)
    const [ig, id] = [blocs.indexOf(gauche), blocs.indexOf(droite)]
    const depart = { x: e.clientX, gauche: largeurs[ig]!, droite: largeurs[id]! }
    const mini = (total * LARGEUR_BLOC.min) / 100
    const suivre = (ev: PointerEvent) => {
      const dx = Math.max(mini - depart.gauche, Math.min(depart.droite - mini, ev.clientX - depart.x))
      largeurs[ig] = depart.gauche + dx
      largeurs[id] = depart.droite - dx
      blocs.forEach((b, i) => (b.style.flexGrow = String(largeurs[i])))
    }
    const finir = () => {
      window.removeEventListener('pointermove', suivre)
      window.removeEventListener('pointerup', finir)
      document.body.classList.remove('redimensionne-largeur')
      if (Math.round(largeurs[ig]!) !== Math.round(depart.gauche)) changer(largeurs.map((l) => Math.round((l / total) * 100)))
    }
    document.body.classList.add('redimensionne-largeur')
    window.addEventListener('pointermove', suivre)
    window.addEventListener('pointerup', finir)
  }
  return (
    <div
      className="poignee-largeur"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largeur des blocs"
      title="Tirer pour changer la largeur ; double-clic : parts égales"
      onPointerDown={commencer}
      onDoubleClick={(e) => {
        const n = e.currentTarget.parentElement?.querySelectorAll(':scope > .bloc-dashboard').length ?? 0
        changer(Array.from({ length: n }, () => null))
      }}
    />
  )
}
