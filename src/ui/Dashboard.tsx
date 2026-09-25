import { useRef, useState } from 'react'
import { BLOCS_PAR_RANGEE, estPropre, type Bloc, type PlaceBloc } from '../core/dashboard'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace, EtatDashboard } from '../core/depot-espace'
import { idBase } from '../core/identifiants'
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
import { usePageOuverte } from './usePageOuverte'
import { ArrowDown, ArrowUp, ChevronRight, Ellipsis, Plus } from 'lucide-react'

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
  const d = etat.dashboard
  const modifier = (op: Parameters<DepotEspace['modifierDashboard']>[1]) => void lancer(espace.modifierDashboard(etat.id, op))

  if (!d) {
    return (
      <div className="zone-tableau">
        <p className="erreur">Dashboard « {etat.id} » illisible : {etat.avertissements.join(' ; ')}</p>
      </div>
    )
  }
  // Identifiants des vues propres, pour en créer une nouvelle sans doublon.
  const idsPropres = d.rangees.flatMap((r) => r.blocs.flatMap((b) => (estPropre(b) ? [b.vue.id] : [])))

  return (
    <div className={`zone-vue ${page ? 'avec-page' : ''} ${pleinEcran ? 'page-plein-ecran' : ''}`}>
      <div className="zone-tableau zone-dashboard">
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
          <h1 onDoubleClick={() => setEdition(true)} title="Double-clic pour renommer">
            {d.nom}
          </h1>
        )}
        {etat.avertissements.length > 0 && (
          <details className="avertissements">
            <summary>⚠ {etat.avertissements.length} signalement(s)</summary>
            <ul>
              {etat.avertissements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}
        {d.rangees.length === 0 && <p className="discret">Dashboard vide : ajoute un premier bloc, une vue d'une de tes bases.</p>}
        {d.rangees.map((r, i) => (
          <div key={i} className="rangee-dashboard">
            {r.blocs.map((b, j) => (
              <BlocDashboard
                key={`${b.base}/${estPropre(b) ? `propre:${b.vue.id}` : b.vue}/${j}`}
                espace={espace}
                idDashboard={etat.id}
                place={{ rangee: i, bloc: j }}
                bloc={b}
                ouvrir={ouvrir}
                allerABase={allerABase}
                retirer={() => modifier({ type: 'retirer_bloc', place: { rangee: i, bloc: j } })}
              />
            ))}
            {r.blocs.length < BLOCS_PAR_RANGEE && (
              <AjoutBloc idsPropres={idsPropres} ajouter={(bloc) => modifier({ type: 'ajouter_bloc', rangee: i, bloc })} compact />
            )}
            <div className="deplacer-rangee">
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
          </div>
        ))}
        <AjoutBloc idsPropres={idsPropres} ajouter={(bloc) => modifier({ type: 'ajouter_bloc', rangee: null, bloc })} />
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
  bloc: Bloc
  ouvrir: (base: string, id: string) => void
  allerABase: (base: string) => void
  retirer: () => void
}

/** Un bloc : sa base et sa vue doivent exister, sinon il le dit et peut être retiré. */
function BlocDashboard(p: PropsBloc) {
  const { etat } = useEspace()
  const etatBase = etat.bases.get(p.bloc.base)
  const depot = etatBase?.depot
  const vue = estPropre(p.bloc) ? p.bloc.vue : etatBase?.vues.find((v) => v.id === p.bloc.vue)
  if (!depot || !vue) {
    return (
      <section className="bloc-dashboard bloc-casse">
        <p className="erreur">
          {!depot ? `Base « ${p.bloc.base} » introuvable` : `Vue « ${String(p.bloc.vue)} » introuvable dans ${depot.schema.nom}`}
        </p>
        <button onClick={p.retirer}>Retirer le bloc</button>
      </section>
    )
  }
  return <BlocVue {...p} depot={depot} vue={vue} />
}

function BlocVue({ espace, idDashboard, place, bloc, depot, vue, ouvrir, allerABase, retirer }: PropsBloc & { depot: DepotBase; vue: Vue }) {
  const lancer = useLancer()
  const appliquee = useVueAppliquee(bloc.base, depot, vue)
  const [menu, setMenu] = useState(false)
  const [renommage, setRenommage] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  const propre = estPropre(bloc)
  // Vue propre : écrite dans le dashboard. Référence : dans le fichier de la vue, partagé avec la base.
  const modifierVue = (m: ModificationVue) =>
    void lancer(propre ? espace.modifierDashboard(idDashboard, { type: 'modifier_vue', place, modifs: m }) : espace.modifierVue(bloc.base, vue.id, m))

  return (
    <section className="bloc-dashboard">
      <div className="entete-bloc">
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
          <span className="nom-vue-bloc" onDoubleClick={() => propre && setRenommage(true)} title={propre ? 'Double-clic pour renommer' : undefined}>
            {vue.nom}
          </span>
        )}
        <span className={`etiquette-bloc ${propre ? 'propre' : ''}`} title={propre ? 'Vue écrite dans ce dashboard' : 'Vue de la base : la modifier ici la modifie aussi dans la base'}>
          {propre ? 'vue propre' : 'vue de la base'}
        </span>
        <span className="espaceur" />
        <OutilsVue schema={depot.schema} vue={vue} modifier={modifierVue} />
        <button ref={ancre} className="discret" onClick={() => setMenu(true)} aria-label="Options du bloc">
          <Icone de={Ellipsis} />
        </button>
        {menu && (
          <Flottant ancre={ancre.current} fermer={() => setMenu(false)}>
            <button className="option" onClick={() => (setMenu(false), allerABase(bloc.base))}>
              Ouvrir la base {depot.schema.nom}
            </button>
            {propre && (
              <button className="option" onClick={() => (setMenu(false), setRenommage(true))}>
                Renommer la vue
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
        <ContenuVue
          espace={espace}
          base={bloc.base}
          depot={depot}
          vue={vue}
          modifierVue={modifierVue}
          appliquee={appliquee}
          ouvrir={(l) => ouvrir(bloc.base, l.id)}
        />
      </div>
    </section>
  )
}

/** Ajout d'un bloc : une base, puis une de ses vues ou une vue propre au dashboard. */
function AjoutBloc({ idsPropres, ajouter, compact }: { idsPropres: string[]; ajouter: (b: Bloc) => void; compact?: boolean }) {
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
