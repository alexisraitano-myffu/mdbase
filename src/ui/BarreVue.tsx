import { useRef, useState, type ReactNode } from 'react'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import { natureDe, type Colonne, type ColonneRelation, type Schema } from '../core/schema'
import { colonnesDeLaVue, groupables } from '../core/groupes'
import { PROFONDEUR_MAX, type ModificationVue, type Niveau, type Tri, type TypeVue, type Vue } from '../core/vue'
import { useLancer } from './actions'
import { colonnesFiltrables, EditeurFiltres } from './EditeurFiltres'
import { MenuExporter } from './Echange'
import { Flottant } from './flottant'
import { useEspace } from './contexte-espace'
import { Icone, ICONES, ICONES_VUES } from './icones'
import { TYPES_GROUPE_KANBAN } from './Kanban'
import { Pastilles } from './Pastilles'
import { Plus } from 'lucide-react'
import { useConsultation } from './mode'

type Props = {
  espace: DepotEspace
  base: string
  schema: Schema
  vues: Vue[]
  vue: Vue
  choisirVue: (id: string) => void
  /** Lignes affichées par la vue, pour l'export. */
  lignesVue: LigneVue[]
}

/** Onglets de vues, panneaux Filtrer / Trier, et pastilles de filtres rapides (spec §7). */
export function BarreVue({ espace, base, schema, vues, vue, choisirVue, lignesVue }: Props) {
  const lancer = useLancer()
  const modifier = (m: Parameters<DepotEspace['modifierVue']>[2]) => void lancer(espace.modifierVue(base, vue.id, m))
  // Consultation : les onglets servent à changer de vue, et seuls les filtres rapides restent.
  const lecture = useConsultation()

  return (
    <div className="barre-vue">
      <div className="onglets">
        {vues.map((v) => (
          <Onglet
            key={v.id}
            vue={v}
            active={v.id === vue.id}
            choisir={() => choisirVue(v.id)}
            lecture={lecture}
            renommer={(nom) => void lancer(espace.modifierVue(base, v.id, { nom }))}
            supprimer={vues.length > 1 ? () => void lancer(espace.supprimerVue(base, v.id)) : undefined}
            deposer={(glissee) => {
              if (glissee === v.id) return
              const ids = vues.map((x) => x.id).filter((x) => x !== glissee)
              ids.splice(ids.indexOf(v.id), 0, glissee)
              void lancer(espace.ordonnerVues(base, ids))
            }}
          />
        ))}
        {!lecture && (
          <>
            <AjoutVue espace={espace} base={base} schema={schema} vues={vues} choisirVue={choisirVue} />
            <OutilsVue schema={schema} vue={vue} modifier={modifier} />
            <MenuExporter espace={espace} base={base} schema={schema} vue={vue} lignesVue={lignesVue} />
          </>
        )}
      </div>

      <Pastilles schema={schema} pastilles={vue.filtresRapides} changer={(filtresRapides) => modifier({ filtresRapides })} />
    </div>
  )
}

/**
 * Réglages d'une nouvelle vue : un kanban est groupé d'emblée par la première
 * colonne qui s'y prête, un calendrier ou une timeline placé sur la première
 * colonne de date.
 */
export function reglagesParDefaut(type: TypeVue, schema: Schema): ModificationVue {
  const groupe =
    type === 'kanban'
      ? (['select', 'checkbox', 'relation', 'multiselect'] as const).flatMap((t) => schema.colonnes.filter((c) => c.type === t))[0]?.cle
      : undefined
  const date = type === 'calendrier' || type === 'timeline' ? colonnesDates(schema)[0]?.cle : undefined
  return { ...(groupe && { groupe }), ...(date && { champDebut: date }) }
}

/** Filtrer, Trier et Options d'une vue ; `modifier` enregistre dans le fichier de la vue ou dans le dashboard. */
export function OutilsVue({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  return (
    <div className="outils-vue">
      <Panneau libelle={`Filtrer${vue.filtres.length ? ` (${vue.filtres.length})` : ''}`} actif={vue.filtres.length > 0}>
        <EditeurFiltres schema={schema} filtres={vue.filtres} changer={(filtres) => modifier({ filtres })} />
      </Panneau>
      <Panneau libelle={`Trier${vue.tris.length ? ` (${vue.tris.length})` : ''}`} actif={vue.tris.length > 0}>
        <EditeurTris schema={schema} tris={vue.tris} changer={(tris) => modifier({ tris })} />
      </Panneau>
      <Panneau libelle="Options" actif={false}>
        {vue.type === 'kanban' || vue.type === 'collection' ? (
          <OptionsCartes schema={schema} vue={vue} modifier={modifier} />
        ) : vue.type === 'calendrier' || vue.type === 'timeline' ? (
          <OptionsTemps schema={schema} vue={vue} modifier={modifier} />
        ) : (
          <OptionsVue schema={schema} vue={vue} modifier={modifier} />
        )}
      </Panneau>
    </div>
  )
}

export const TYPES_CREABLES: { type: TypeVue; nom: string }[] = [
  { type: 'tableau', nom: 'Tableau' },
  { type: 'kanban', nom: 'Kanban' },
  { type: 'collection', nom: 'Collection' },
  { type: 'calendrier', nom: 'Calendrier' },
  { type: 'timeline', nom: 'Timeline' },
]


/** « + » des onglets : nouvelle vue d'un type donné, avec ses réglages par défaut. */
function AjoutVue(p: { espace: DepotEspace; base: string; schema: Schema; vues: Vue[]; choisirVue: (id: string) => void }) {
  const lancer = useLancer()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const creer = async (type: TypeVue, nom: string) => {
    setOuvert(false)
    const id = await lancer(p.espace.creerVue(p.base, `${nom} ${p.vues.length + 1}`, type, reglagesParDefaut(type, p.schema)))
    if (id) p.choisirVue(id)
  }
  return (
    <>
      <button ref={ancre} className="discret onglet-ajout" title="Nouvelle vue" onClick={() => setOuvert(true)}>
        <Icone de={Plus} />
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          {TYPES_CREABLES.map((t) => (
            <button key={t.type} className="option" onClick={() => void creer(t.type, t.nom)}>
              <Icone de={ICONES_VUES[t.type]} />
              {t.nom}
            </button>
          ))}
        </Flottant>
      )}
    </>
  )
}

function Onglet(p: {
  vue: Vue
  active: boolean
  choisir: () => void
  lecture: boolean
  renommer: (nom: string) => void
  supprimer?: (() => void) | undefined
  /** Une vue glissée est déposée sur cet onglet : elle prend sa place. */
  deposer: (idGlissee: string) => void
}) {
  const [edition, setEdition] = useState(false)
  const [cible, setCible] = useState(false)
  const [menu, setMenu] = useState(false)
  const ancre = useRef<HTMLDivElement>(null)
  if (p.lecture) {
    return (
      <div className={`onglet ${p.active ? 'actif' : ''}`} onClick={p.choisir}>
        <Icone de={ICONES_VUES[p.vue.type]} />
        {p.vue.nom}
      </div>
    )
  }
  if (edition) {
    return (
      <input
        className="champ-en-ligne"
        autoFocus
        defaultValue={p.vue.nom}
        onBlur={(e) => {
          setEdition(false)
          const nom = e.target.value.trim()
          if (nom && nom !== p.vue.nom) p.renommer(nom)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEdition(false)
        }}
      />
    )
  }
  return (
    <div
      ref={ancre}
      className={`onglet ${p.active ? 'actif' : ''} ${cible ? 'cible' : ''}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/vue', p.vue.id)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/vue')) return
        e.preventDefault()
        setCible(true)
      }}
      onDragLeave={() => setCible(false)}
      onDrop={(e) => {
        setCible(false)
        const id = e.dataTransfer.getData('text/vue')
        if (id) p.deposer(id)
      }}
      onClick={p.choisir}
      onDoubleClick={() => setEdition(true)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu(true)
      }}
      title="Glisser pour réordonner, double-clic pour renommer, clic droit pour plus"
    >
      <Icone de={ICONES_VUES[p.vue.type]} />
      {p.vue.nom}
      {menu && (
        <Flottant ancre={ancre.current} fermer={() => setMenu(false)}>
          <button className="option" onClick={() => (setMenu(false), setEdition(true))}>
            Renommer
          </button>
          {p.supprimer ? (
            <button className="option danger-texte" onClick={() => (setMenu(false), p.supprimer!())}>
              Supprimer la vue
            </button>
          ) : (
            <div className="option discret">Dernière vue : non supprimable</div>
          )}
        </Flottant>
      )}
    </div>
  )
}

function Panneau({ libelle, actif, children }: { libelle: string; actif: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ancre} className={`discret outil ${actif ? 'actif' : ''}`} onClick={() => setOuvert(true)}>
        {libelle}
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau">{children}</div>
        </Flottant>
      )}
    </>
  )
}

function EditeurTris({ schema, tris, changer }: { schema: Schema; tris: Tri[]; changer: (t: Tri[]) => void }) {
  const colonnes = colonnesFiltrables(schema)
  const libres = colonnes.filter((c) => !tris.some((t) => t.colonne === c.cle))
  return (
    <div className="editeur-filtres">
      {tris.length === 0 && <div className="discret">Aucun tri : ordre des fichiers</div>}
      {tris.map((t, i) => (
        <div key={t.colonne} className="ligne-filtre">
          <select
            value={t.colonne}
            onChange={(e) => changer(tris.map((x, j) => (j === i ? { ...x, colonne: e.target.value } : x)))}
          >
            {colonnes
              .filter((c) => c.cle === t.colonne || libres.includes(c))
              .map((c) => (
                <option key={c.cle} value={c.cle}>
                  {c.nom}
                </option>
              ))}
          </select>
          <select
            value={t.sens}
            onChange={(e) => changer(tris.map((x, j) => (j === i ? { ...x, sens: e.target.value as Tri['sens'] } : x)))}
          >
            <option value="asc">croissant</option>
            <option value="desc">décroissant</option>
          </select>
          <button className="discret" onClick={() => changer(tris.filter((_, j) => j !== i))} aria-label="Retirer le tri">
            ×
          </button>
        </div>
      ))}
      {libres[0] && (
        <button className="discret ajout-filtre" onClick={() => changer([...tris, { colonne: libres[0]!.cle, sens: 'asc' }])}>
          <Icone de={Plus} /> Ajouter un tri
        </button>
      )}
    </div>
  )
}

/** Réglages d'affichage du tableau : groupement, retour à la ligne, colonnes affichées (spec §7). */
function OptionsVue({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const { visibles, masquees } = colonnesDeLaVue(schema, vue)
  const toutes = [...visibles, ...masquees]
  const cachees = new Set(masquees.map((c) => c.cle))
  return (
    <div className="editeur-filtres">
      <label className="case-reglage">
        Grouper par
        <select value={vue.groupe ?? ''} onChange={(e) => modifier({ groupe: e.target.value || undefined })}>
          <option value="">aucun groupement</option>
          {groupables(schema).map((c) => (
            <option key={c.cle} value={c.cle}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="case-reglage">
        <input type="checkbox" checked={vue.retourLigne === true} onChange={(e) => modifier({ retourLigne: e.target.checked })} />
        Retour à la ligne dans les cellules
      </label>
      <div className="titre-section">Colonnes affichées</div>
      {toutes.map((c) => (
        <label key={c.cle} className="case-reglage">
          <input
            type="checkbox"
            checked={!cachees.has(c.cle)}
            disabled={c.cle === schema.champTitre}
            onChange={(e) =>
              modifier({
                masquees: e.target.checked ? masquees.map((x) => x.cle).filter((x) => x !== c.cle) : [...masquees.map((x) => x.cle), c.cle],
              })
            }
          />
          <Icone de={ICONES[c.type]} />
          {c.nom}
        </label>
      ))}
    </div>
  )
}

/** Réglages du kanban et de la collection : colonnes, couloirs, champs de la carte, aperçu du corps. */
function OptionsCartes({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const candidats = schema.colonnes.filter((c) => TYPES_GROUPE_KANBAN.includes(c.type))
  return (
    <div className="editeur-filtres">
      {vue.type === 'kanban' && (
        <>
          <label className="case-reglage">
            Colonnes selon
            <select value={vue.groupe ?? ''} onChange={(e) => modifier({ groupe: e.target.value || undefined })}>
              <option value="" disabled>
                choisir…
              </option>
              {candidats.map((c) => (
                <option key={c.cle} value={c.cle}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="case-reglage">
            Couloirs selon
            <select value={vue.sousGroupe ?? ''} onChange={(e) => modifier({ sousGroupe: e.target.value || undefined })}>
              <option value="">pas de couloirs</option>
              {candidats
                .filter((c) => c.cle !== vue.groupe)
                .map((c) => (
                  <option key={c.cle} value={c.cle}>
                    {c.nom}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {vue.type === 'collection' && (
        <label className="case-reglage">
          <input type="checkbox" checked={vue.apercuCorps === true} onChange={(e) => modifier({ apercuCorps: e.target.checked })} />
          Afficher le début du contenu
        </label>
      )}
      <ChampsAffiches schema={schema} vue={vue} modifier={modifier} titre="Champs sur la carte" />
    </div>
  )
}

const colonnesDates = (schema: Schema) => schema.colonnes.filter((c) => natureDe(c) === 'date')

/** Réglages du calendrier et de la timeline : champ de date (ou de début), de fin, jalons (spec §7). */
function OptionsTemps({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const dates = colonnesDates(schema)
  if (dates.length === 0) return <div className="discret">Ajoute d'abord une colonne de type date à la base.</div>
  const timeline = vue.type === 'timeline'
  const jalons = new Set(vue.champsJalons ?? [])
  const candidats = dates.filter((c) => c.cle !== vue.champDebut && c.cle !== vue.champFin)
  return (
    <div className="editeur-filtres">
      <label className="case-reglage">
        {timeline ? 'Début' : 'Date'}
        <select value={vue.champDebut ?? ''} onChange={(e) => modifier({ champDebut: e.target.value || undefined })}>
          <option value="" disabled>
            choisir…
          </option>
          {dates.map((c) => (
            <option key={c.cle} value={c.cle}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="case-reglage">
        Fin
        <select value={vue.champFin ?? ''} onChange={(e) => modifier({ champFin: e.target.value || undefined })}>
          <option value="">{timeline ? 'pas de fin (barres d’un jour)' : 'pas de fin (un seul jour)'}</option>
          {dates
            .filter((c) => c.cle !== vue.champDebut)
            .map((c) => (
              <option key={c.cle} value={c.cle}>
                {c.nom}
              </option>
            ))}
        </select>
      </label>
      {timeline && (
        <label className="case-reglage">
          Grouper par
          <select value={vue.groupe ?? ''} onChange={(e) => modifier({ groupe: e.target.value || undefined })}>
            <option value="">aucun groupement</option>
            {groupables(schema).map((c) => (
              <option key={c.cle} value={c.cle}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
      )}
      {timeline && (
        <>
          <div className="titre-section">Jalons (points sur la barre)</div>
          {candidats.length === 0 && <div className="discret">Aucune autre colonne date à poser en jalon.</div>}
          {candidats.map((c) => (
              <label key={c.cle} className="case-reglage">
                <input
                  type="checkbox"
                  checked={jalons.has(c.cle)}
                  onChange={(e) => {
                    const suivants = new Set(jalons)
                    if (e.target.checked) suivants.add(c.cle)
                    else suivants.delete(c.cle)
                    modifier({ champsJalons: dates.map((x) => x.cle).filter((x) => suivants.has(x)) })
                  }}
                />
                <Icone de={ICONES[c.type]} />
                {c.nom}
              </label>
            ))}
        </>
      )}
      {timeline && (
        <>
          <div className="titre-section">Déplier par</div>
          <div className="discret aide-reglage">Sous chaque ligne, les lignes liées par les relations cochées.</div>
          <OptionsDeplier schema={schema} niveaux={vue.deplier ?? []} changer={(deplier) => modifier({ deplier })} profondeur={1} />
        </>
      )}
      <ChampsAffiches schema={schema} vue={vue} modifier={modifier} titre={timeline ? 'Champs sur la barre' : 'Champs affichés'} />
    </div>
  )
}

/** Premières dates d'un niveau coché : un début, et une fin si une colonne s'y prête par son nom. */
function niveauParDefaut(relation: string, schema: Schema): Niveau {
  const dates = colonnesDates(schema)
  const estFin = (c: Colonne) => /fin|[ée]ch[ée]ance|end|livraison/i.test(`${c.cle} ${c.nom}`)
  const debut = dates.find((c) => !estFin(c)) ?? dates[0]
  const fin = dates.find((c) => c !== debut && estFin(c))
  return { relation, ...(debut && { champDebut: debut.cle }), ...(fin && { champFin: fin.cle }), filtres: [], deplier: [] }
}

/**
 * Timeline : relations à déplier sous chaque ligne (spec §7). Une relation
 * cochée ouvre ses réglages : dates de la base liée, filtres, niveau suivant.
 * `retour` : la relation qui ramène au niveau parent, jamais proposée.
 */
function OptionsDeplier(p: { schema: Schema; niveaux: Niveau[]; changer: (n: Niveau[]) => void; retour?: string; profondeur: number }) {
  const { etat } = useEspace()
  const relations = p.schema.colonnes.filter((c): c is ColonneRelation => c.type === 'relation' && c.cle !== p.retour)
  if (relations.length === 0) {
    return p.profondeur === 1 ? <div className="discret">Aucune relation dans cette base.</div> : null
  }
  return (
    <div className="options-deplier">
      {p.profondeur > 1 && <div className="titre-niveau">Puis déplier par</div>}
      {relations.map((c) => {
        const niveau = p.niveaux.find((n) => n.relation === c.cle)
        const cible = etat.bases.get(c.cible)?.depot?.schema
        return (
          <div key={c.cle}>
            <label className="case-reglage">
              <input
                type="checkbox"
                checked={niveau !== undefined}
                disabled={!cible}
                onChange={(e) =>
                  p.changer(e.target.checked && cible ? [...p.niveaux, niveauParDefaut(c.cle, cible)] : p.niveaux.filter((n) => n.relation !== c.cle))
                }
              />
              <Icone de={ICONES.relation} />
              {c.nom}
              {cible && cible.nom !== c.nom && <span className="discret">({cible.nom})</span>}
            </label>
            {niveau && cible && (
              <ReglagesNiveau
                schema={cible}
                niveau={niveau}
                changer={(m) => p.changer(p.niveaux.map((n) => (n === niveau ? { ...n, ...m } : n)))}
                retour={c.inverse}
                profondeur={p.profondeur}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReglagesNiveau(p: { schema: Schema; niveau: Niveau; changer: (m: Partial<Niveau>) => void; retour: string; profondeur: number }) {
  const { schema, niveau } = p
  const dates = colonnesDates(schema)
  const jalons = new Set(niveau.champsJalons ?? [])
  const choisir = (valeur: string, vide: string, exclure?: string) => (
    <>
      <option value="">{vide}</option>
      {dates
        .filter((c) => c.cle !== exclure)
        .map((c) => (
          <option key={c.cle} value={c.cle}>
            {c.nom}
          </option>
        ))}
      {valeur && !dates.some((c) => c.cle === valeur) && <option value={valeur}>{valeur} (disparue)</option>}
    </>
  )
  return (
    <div className="reglages-niveau">
      {dates.length === 0 ? (
        <div className="discret">{schema.nom} n'a pas de colonne date : ses lignes s'affichent sans barre.</div>
      ) : (
        <>
          <label className="case-reglage">
            Début
            <select value={niveau.champDebut ?? ''} onChange={(e) => p.changer({ champDebut: e.target.value || undefined })}>
              {choisir(niveau.champDebut ?? '', 'aucune date')}
            </select>
          </label>
          <label className="case-reglage">
            Fin
            <select value={niveau.champFin ?? ''} onChange={(e) => p.changer({ champFin: e.target.value || undefined })}>
              {choisir(niveau.champFin ?? '', 'pas de fin (losanges)', niveau.champDebut)}
            </select>
          </label>
          {dates
            .filter((c) => c.cle !== niveau.champDebut && c.cle !== niveau.champFin)
            .map((c) => (
              <label key={c.cle} className="case-reglage">
                <input
                  type="checkbox"
                  checked={jalons.has(c.cle)}
                  onChange={(e) => {
                    const suivants = new Set(jalons)
                    if (e.target.checked) suivants.add(c.cle)
                    else suivants.delete(c.cle)
                    p.changer({ champsJalons: dates.map((x) => x.cle).filter((x) => suivants.has(x)) })
                  }}
                />
                Jalon : {c.nom}
              </label>
            ))}
        </>
      )}
      <details className="filtres-niveau" open={niveau.filtres.length > 0 || undefined}>
        <summary>
          Filtrer les lignes de {schema.nom}
          {niveau.filtres.length > 0 && ` (${niveau.filtres.length})`}
        </summary>
        <EditeurFiltres schema={schema} filtres={niveau.filtres} changer={(filtres) => p.changer({ filtres })} />
      </details>
      {p.profondeur < PROFONDEUR_MAX && (
        <OptionsDeplier schema={schema} niveaux={niveau.deplier} changer={(deplier) => p.changer({ deplier })} retour={p.retour} profondeur={p.profondeur + 1} />
      )}
    </div>
  )
}

/** Colonnes affichées sous le titre d'une carte, d'une case du calendrier ou d'une barre (`champs_carte`), dans l'ordre du schéma. */
function ChampsAffiches({ schema, vue, modifier, titre }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void; titre: string }) {
  const champs = new Set(vue.champsCarte ?? [])
  return (
    <>
      <div className="titre-section">{titre}</div>
      {schema.colonnes
        .filter((c) => c.cle !== schema.champTitre)
        .map((c) => (
          <label key={c.cle} className="case-reglage">
            <input
              type="checkbox"
              checked={champs.has(c.cle)}
              onChange={(e) => {
                const suivants = new Set(champs)
                if (e.target.checked) suivants.add(c.cle)
                else suivants.delete(c.cle)
                // Dans l'ordre du schéma.
                modifier({ champsCarte: schema.colonnes.map((x) => x.cle).filter((x) => suivants.has(x)) })
              }}
            />
            <Icone de={ICONES[c.type]} />
            {c.nom}
          </label>
        ))}
    </>
  )
}
