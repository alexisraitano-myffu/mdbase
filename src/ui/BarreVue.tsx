import { useRef, useState, type ReactNode } from 'react'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import { natureDe, type Colonne, type ColonneChoix, type ColonneRelation, type Schema } from '../core/schema'
import { colonnesDeLaVue, groupables } from '../core/groupes'
import { PROFONDEUR_MAX, type Bande, type ModificationVue, type Niveau, type Tri, type TypeVue, type Vue } from '../core/vue'
import { useLancer } from './actions'
import { colonnesFiltrables, EditeurFiltres, entreesColonnes } from './EditeurFiltres'
import { MenuExporter } from './Echange'
import { Flottant } from './flottant'
import { useEspace } from './contexte-espace'
import { Icone, ICONES, ICONES_VUES } from './icones'
import { TYPES_GROUPE_KANBAN } from './Kanban'
import { OrdreGroupes } from './OrdreGroupes'
import { Pastilles } from './Pastilles'
import { ArrowDown, ArrowUp, ChartGantt, ChevronRight, Plus, Tag, X } from 'lucide-react'
import { Choix, type EntreeChoix } from './Choix'
import { Interrupteur, Reglage, Section, Visibilite } from './reglages'
import { useConsultation } from './mode'
import { COULEURS, type ReglageCouleur } from '../core/couleurs'

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
      <Panneau libelle={`Filtrer${vue.filtres.length ? ` (${vue.filtres.length})` : ''}`} actif={vue.filtres.length > 0} large>
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

function Panneau({ libelle, actif, large, children }: { libelle: string; actif: boolean; large?: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ancre} className={`discret outil ${actif ? 'actif' : ''}`} onClick={() => setOuvert(true)}>
        {libelle}
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className={`panneau ${large ? 'large' : ''}`}>{children}</div>
        </Flottant>
      )}
    </>
  )
}

export function EditeurTris({ schema, tris, changer, sansTri = 'Aucun tri : ordre des fichiers' }: { schema: Schema; tris: Tri[]; changer: (t: Tri[]) => void; sansTri?: string }) {
  const colonnes = colonnesFiltrables(schema)
  const libres = colonnes.filter((c) => !tris.some((t) => t.colonne === c.cle))
  return (
    <div className="editeur-filtres">
      {tris.length === 0 && <div className="discret">{sansTri}</div>}
      {tris.map((t, i) => (
        <div key={t.colonne} className="ligne-filtre">
          <span className="liaison-filtre">{i === 0 ? 'Par' : 'Puis'}</span>
          <Choix
            valeur={t.colonne}
            entrees={entreesColonnes(colonnes.filter((c) => c.cle === t.colonne || libres.includes(c)))}
            libelle="Colonne du tri"
            changer={(v) => changer(tris.map((x, j) => (j === i ? { ...x, colonne: v } : x)))}
          />
          <Choix
            valeur={t.sens}
            entrees={[
              { valeur: 'asc', libelle: 'croissant', icone: ArrowUp },
              { valeur: 'desc', libelle: 'décroissant', icone: ArrowDown },
            ]}
            libelle="Sens du tri"
            changer={(v) => changer(tris.map((x, j) => (j === i ? { ...x, sens: v as Tri['sens'] } : x)))}
          />
          <button className="discret retirer" onClick={() => changer(tris.filter((_, j) => j !== i))} aria-label="Retirer le tri" title="Retirer le tri">
            <Icone de={X} taille={14} />
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

/** Entrées « aucun » puis une colonne par entrée ; une valeur disparue reste choisissable, signalée. */
function entreesAvecVide(vide: string, colonnes: Colonne[]): EntreeChoix[] {
  return [{ valeur: '', libelle: vide }, ...entreesColonnes(colonnes)]
}

/** Réglages d'affichage du tableau : groupement, retour à la ligne, colonnes affichées (spec §7). */
function OptionsVue({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const { visibles, masquees } = colonnesDeLaVue(schema, vue)
  const toutes = [...visibles, ...masquees]
  const cachees = new Set(masquees.map((c) => c.cle))
  return (
    <div className="reglages">
      <Section>
        <Reglage libelle="Grouper par">
          <Choix
            valeur={vue.groupe ?? ''}
            entrees={entreesAvecVide('aucun groupement', groupables(schema))}
            libelle="Grouper par"
            inconnue={`${vue.groupe} (disparue)`}
            // Sans groupe, plus de sous-groupe.
            changer={(v) => modifier({ groupe: v || undefined, ...(!v && { sousGroupe: undefined }) })}
          />
        </Reglage>
        <ReglageSousGroupe schema={schema} vue={vue} modifier={modifier} />
        <Interrupteur libelle="Retour à la ligne dans les cellules" coche={vue.retourLigne === true} changer={(v) => modifier({ retourLigne: v })} />
      </Section>
      <Section titre="Colonnes affichées">
        {toutes.map((c) => (
          <Visibilite
            key={c.cle}
            libelle={c.nom}
            icone={ICONES[c.type]}
            visible={!cachees.has(c.cle)}
            desactive={c.cle === schema.champTitre}
            changer={(v) =>
              modifier({
                masquees: v ? masquees.map((x) => x.cle).filter((x) => x !== c.cle) : [...masquees.map((x) => x.cle), c.cle],
              })
            }
          />
        ))}
      </Section>
    </div>
  )
}

/** Réglages du kanban et de la collection : colonnes, couloirs, champs de la carte, aperçu du corps. */
function OptionsCartes({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const candidats = schema.colonnes.filter((c) => TYPES_GROUPE_KANBAN.includes(c.type))
  return (
    <div className="reglages">
      <Section>
        {vue.type === 'kanban' && (
          <>
            <Reglage libelle="Colonnes selon">
              <Choix
                valeur={vue.groupe ?? ''}
                entrees={entreesColonnes(candidats)}
                libelle="Colonnes selon"
                inconnue={`${vue.groupe} (disparue)`}
                // L'ordre réglé valait pour les valeurs de l'ancienne colonne.
                changer={(v) => modifier({ groupe: v || undefined, ordreGroupes: undefined })}
              />
            </Reglage>
            <Reglage libelle="Couloirs selon">
              <Choix
                valeur={vue.sousGroupe ?? ''}
                entrees={entreesAvecVide('pas de couloirs', candidats.filter((c) => c.cle !== vue.groupe))}
                libelle="Couloirs selon"
                inconnue={`${vue.sousGroupe} (disparue)`}
                changer={(v) => modifier({ sousGroupe: v || undefined })}
              />
            </Reglage>
          </>
        )}
        {vue.type === 'collection' && (
          <Interrupteur libelle="Afficher le début du contenu" coche={vue.apercuCorps === true} changer={(v) => modifier({ apercuCorps: v })} />
        )}
      </Section>
      {vue.type === 'kanban' && <OrdreGroupes schema={schema} vue={vue} modifier={modifier} />}
      <ChampsAffiches schema={schema} vue={vue} modifier={modifier} titre="Champs sur la carte" />
    </div>
  )
}

const colonnesDates = (schema: Schema) => schema.colonnes.filter((c) => natureDe(c) === 'date')

/** Colonnes cochées après une bascule, dans l'ordre de `dates` (celui du schéma). */
function basculerCle(dates: readonly Colonne[], choisies: ReadonlySet<string>, cle: string, oui: boolean): string[] {
  const suivants = new Set(choisies)
  if (oui) suivants.add(cle)
  else suivants.delete(cle)
  return dates.map((x) => x.cle).filter((x) => suivants.has(x))
}

/** Réglages du calendrier et de la timeline : champ de date (ou de début), de fin, jalons (spec §7). */
function OptionsTemps({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const dates = colonnesDates(schema)
  if (dates.length === 0) return <div className="discret">Ajoute d'abord une colonne de type date à la base.</div>
  const timeline = vue.type === 'timeline'
  const jalons = new Set(vue.champsJalons ?? [])
  const candidats = dates.filter((c) => c.cle !== vue.champDebut && c.cle !== vue.champFin)
  return (
    <div className="reglages">
      <Section>
        <Reglage libelle={timeline ? 'Début' : 'Date'}>
          <Choix
            valeur={vue.champDebut ?? ''}
            entrees={entreesColonnes(dates)}
            libelle={timeline ? 'Début' : 'Date'}
            inconnue={`${vue.champDebut} (disparue)`}
            changer={(v) => modifier({ champDebut: v || undefined })}
          />
        </Reglage>
        <Reglage libelle="Fin">
          <Choix
            valeur={vue.champFin ?? ''}
            entrees={entreesAvecVide(timeline ? 'pas de fin (barres d’un jour)' : 'pas de fin (un seul jour)', dates.filter((c) => c.cle !== vue.champDebut))}
            libelle="Fin"
            inconnue={`${vue.champFin} (disparue)`}
            changer={(v) => modifier({ champFin: v || undefined })}
          />
        </Reglage>
        <ChoixCouleur schema={schema} reglage={vue} changer={modifier} />
        {timeline && (
          <Reglage libelle="Grouper par">
            <Choix
              valeur={vue.groupe ?? ''}
              entrees={entreesAvecVide('aucun groupement', groupables(schema))}
              libelle="Grouper par"
              inconnue={`${vue.groupe} (disparue)`}
              changer={(v) => modifier({ groupe: v || undefined, ...(!v && { sousGroupe: undefined }) })}
            />
          </Reglage>
        )}
        {timeline && <ReglageSousGroupe schema={schema} vue={vue} modifier={modifier} />}
      </Section>
      {timeline && (
        <Section titre="Jalons" aide="Des points sur la barre, aux dates cochées.">
          {candidats.length === 0 && <div className="discret aide-reglage">Aucune autre colonne date à poser en jalon.</div>}
          {candidats.map((c) => (
            <Interrupteur
              key={c.cle}
              libelle={c.nom}
              icone={ICONES[c.type]}
              coche={jalons.has(c.cle)}
              changer={(v) => modifier({ champsJalons: basculerCle(dates, jalons, c.cle, v) })}
            />
          ))}
          {jalons.size > 0 && (
            <Interrupteur libelle="Afficher le nom des jalons" icone={Tag} coche={vue.nomsJalons === true} changer={(v) => modifier({ nomsJalons: v })} />
          )}
        </Section>
      )}
      {timeline && (
        <Section titre="Déplier par" aide="Sous chaque ligne, les lignes liées par les relations choisies.">
          <OptionsDeplier schema={schema} niveaux={vue.deplier ?? []} changer={(deplier) => modifier({ deplier })} profondeur={1} />
        </Section>
      )}
      {timeline && (
        <Section titre="Bandes" aide="Les lignes d'une autre base (moratoires, sprints…) en bandes qui traversent toute la timeline.">
          <OptionsBandes bandes={vue.bandes ?? []} changer={(bandes) => modifier({ bandes })} />
        </Section>
      )}
      <ChampsAffiches schema={schema} vue={vue} modifier={modifier} titre={timeline ? 'Champs sur la barre' : 'Champs affichés'} titreMasquable={timeline} />
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
 * activée ouvre ses réglages : dates de la base liée, filtres, niveau suivant.
 * `retour` : la relation qui ramène au niveau parent, jamais proposée.
 */
function OptionsDeplier(p: { schema: Schema; niveaux: Niveau[]; changer: (n: Niveau[]) => void; retour?: string; profondeur: number }) {
  const { etat } = useEspace()
  const relations = p.schema.colonnes.filter((c): c is ColonneRelation => c.type === 'relation' && c.cle !== p.retour)
  if (relations.length === 0) {
    return p.profondeur === 1 ? <div className="discret aide-reglage">Aucune relation dans cette base.</div> : null
  }
  return (
    <div className="options-deplier">
      {p.profondeur > 1 && <div className="titre-niveau">Puis déplier par</div>}
      {relations.map((c) => {
        const niveau = p.niveaux.find((n) => n.relation === c.cle)
        const cible = etat.bases.get(c.cible)?.depot?.schema
        return (
          <div key={c.cle}>
            <Interrupteur
              libelle={
                <>
                  {c.nom}
                  {cible && cible.nom !== c.nom && <span className="discret">({cible.nom})</span>}
                </>
              }
              icone={ICONES.relation}
              coche={niveau !== undefined}
              desactive={!cible}
              changer={(v) => p.changer(v && cible ? [...p.niveaux, niveauParDefaut(c.cle, cible)] : p.niveaux.filter((n) => n.relation !== c.cle))}
            />
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

const NOMS_COULEURS: Record<(typeof COULEURS)[number], string> = {
  gris: 'Gris',
  bleu: 'Bleu',
  vert: 'Vert',
  orange: 'Orange',
  violet: 'Violet',
  rose: 'Rose',
  jaune: 'Jaune',
  rouge: 'Rouge',
  marron: 'Marron',
}

/** « Couleur » des barres : selon une colonne select (la couleur de son option), ou une couleur fixe. */
function ChoixCouleur(p: { schema: Schema; reglage: ReglageCouleur; changer: (m: ReglageCouleur) => void }) {
  const choix = p.schema.colonnes.filter((c) => c.type === 'select' || c.type === 'multiselect')
  const valeur = p.reglage.couleurPar ? `par:${p.reglage.couleurPar}` : p.reglage.couleur ? `fixe:${p.reglage.couleur}` : ''
  const changer = (v: string) =>
    p.changer({
      couleur: v.startsWith('fixe:') ? v.slice(5) : undefined,
      couleurPar: v.startsWith('par:') ? v.slice(4) : undefined,
    })
  const entrees: EntreeChoix[] = [
    { valeur: '', libelle: 'neutre' },
    ...choix.map((c) => ({ valeur: `par:${c.cle}`, libelle: `selon ${c.nom}`, icone: ICONES[c.type], groupe: 'Selon une colonne' })),
    ...COULEURS.map((c) => ({ valeur: `fixe:${c}`, libelle: NOMS_COULEURS[c], couleur: c, groupe: 'Couleur fixe' })),
  ]
  const selon = choix.find((c) => c.cle === p.reglage.couleurPar)
  return (
    <>
      <Reglage libelle="Couleur">
        <Choix valeur={valeur} entrees={entrees} libelle="Couleur" inconnue={`${p.reglage.couleurPar} (disparue)`} changer={changer} />
      </Reglage>
      {(selon?.type === 'select' || selon?.type === 'multiselect') && selon.options.length > 0 && <CouleursOptions schema={p.schema} colonne={selon} />}
    </>
  )
}

/** Couleur de chaque option de la colonne qui colore les barres : celle de l'option dans le schéma, qui vaut partout. */
function CouleursOptions({ schema, colonne }: { schema: Schema; colonne: ColonneChoix }) {
  const { espace } = useEspace()
  const lancer = useLancer()
  const entrees: EntreeChoix[] = COULEURS.map((c) => ({ valeur: c, libelle: NOMS_COULEURS[c], couleur: c }))
  return (
    <details className="filtres-niveau couleurs-options">
      <summary>
        <Icone de={ChevronRight} className="chevron-details" taille={14} />
        Couleurs de {colonne.nom} ({colonne.options.length})
      </summary>
      {colonne.options.map((o) => (
        <Reglage key={o.label} libelle={o.label}>
          <Choix
            valeur={o.couleur ?? 'gris'}
            entrees={entrees}
            libelle={`Couleur de « ${o.label} »`}
            changer={(c) => void lancer(espace.changerCouleurOption(schema.id, colonne.cle, o.label, c))}
          />
        </Reglage>
      ))}
    </details>
  )
}

/** Champs d'un niveau déplié affichés sur ses barres, pris dans sa base (`champs_carte` du niveau). */
function ChampsNiveau({ schema, champs, changer, sansTitre, changerTitre }: { schema: Schema; champs: string[]; changer: (c: string[]) => void; sansTitre: boolean; changerTitre: (visible: boolean) => void }) {
  const choisis = new Set(champs)
  const titre = schema.colonnes.find((c) => c.cle === schema.champTitre)
  return (
    <details className="filtres-niveau" open={champs.length > 0 || undefined}>
      <summary>
        <Icone de={ChevronRight} className="chevron-details" taille={14} />
        Champs affichés{champs.length > 0 && ` (${champs.length})`}
      </summary>
      {titre && <Visibilite libelle={titre.nom} icone={ICONES[titre.type]} visible={!sansTitre} changer={changerTitre} />}
      {schema.colonnes
        .filter((c) => c.cle !== schema.champTitre)
        .map((c) => (
          <Visibilite
            key={c.cle}
            libelle={c.nom}
            icone={ICONES[c.type]}
            visible={choisis.has(c.cle)}
            // Dans l'ordre du schéma.
            changer={(v) => changer(basculerCle(schema.colonnes, choisis, c.cle, v))}
          />
        ))}
    </details>
  )
}

function ReglagesNiveau(p: { schema: Schema; niveau: Niveau; changer: (m: Partial<Niveau>) => void; retour: string; profondeur: number }) {
  const { schema, niveau } = p
  const dates = colonnesDates(schema)
  const jalons = new Set(niveau.champsJalons ?? [])
  return (
    <div className="reglages-niveau">
      {dates.length === 0 ? (
        <div className="discret aide-reglage">{schema.nom} n'a pas de colonne date : ses lignes s'affichent sans barre.</div>
      ) : (
        <>
          <Reglage libelle="Début">
            <Choix
              valeur={niveau.champDebut ?? ''}
              entrees={entreesAvecVide('aucune date', dates)}
              libelle="Début"
              inconnue={`${niveau.champDebut} (disparue)`}
              changer={(v) => p.changer({ champDebut: v || undefined })}
            />
          </Reglage>
          <Reglage libelle="Fin">
            <Choix
              valeur={niveau.champFin ?? ''}
              entrees={entreesAvecVide('pas de fin (losanges)', dates.filter((c) => c.cle !== niveau.champDebut))}
              libelle="Fin"
              inconnue={`${niveau.champFin} (disparue)`}
              changer={(v) => p.changer({ champFin: v || undefined })}
            />
          </Reglage>
          {dates
            .filter((c) => c.cle !== niveau.champDebut && c.cle !== niveau.champFin)
            .map((c) => (
              <Interrupteur
                key={c.cle}
                libelle={`Jalon : ${c.nom}`}
                icone={ICONES[c.type]}
                coche={jalons.has(c.cle)}
                changer={(v) => p.changer({ champsJalons: basculerCle(dates, jalons, c.cle, v) })}
              />
            ))}
        </>
      )}
      <ChoixCouleur schema={schema} reglage={niveau} changer={p.changer} />
      <Interrupteur
        libelle="Sur la ligne du parent"
        icone={ChartGantt}
        coche={niveau.surLaLigne === true}
        changer={(v) => p.changer({ surLaLigne: v || undefined })}
      />
      <ChampsNiveau
        schema={schema}
        champs={niveau.champsCarte ?? []}
        changer={(c) => p.changer({ champsCarte: c.length > 0 ? c : undefined })}
        sansTitre={niveau.sansTitre === true}
        changerTitre={(v) => p.changer({ sansTitre: v ? undefined : true })}
      />
      <details className="filtres-niveau" open={niveau.filtres.length > 0 || undefined}>
        <summary>
          <Icone de={ChevronRight} className="chevron-details" taille={14} />
          Filtrer les lignes de {schema.nom}
          {niveau.filtres.length > 0 && ` (${niveau.filtres.length})`}
        </summary>
        <EditeurFiltres schema={schema} filtres={niveau.filtres} changer={(filtres) => p.changer({ filtres })} />
      </details>
      {p.profondeur < PROFONDEUR_MAX && !niveau.surLaLigne && (
        <OptionsDeplier schema={schema} niveaux={niveau.deplier} changer={(deplier) => p.changer({ deplier })} retour={p.retour} profondeur={p.profondeur + 1} />
      )}
    </div>
  )
}

/** Première source de bandes pour une base : ses dates comme pour un niveau déplié, et la couleur de son premier select. */
function bandeParDefaut(base: string, schema: Schema): Bande {
  const { relation: _, filtres: __, deplier: ___, ...dates } = niveauParDefaut('', schema)
  const select = schema.colonnes.find((c) => c.type === 'select')
  return { base, ...dates, ...(select && { couleurPar: select.cle }) }
}

/** Timeline : sources des bandes verticales, chacune avec sa base, ses dates et sa couleur (spec §7). */
function OptionsBandes(p: { bandes: Bande[]; changer: (b: Bande[]) => void }) {
  const { etat } = useEspace()
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot && colonnesDates(b.depot.schema).length > 0 ? [b.depot.schema] : []))
  const entreesBases: EntreeChoix[] = bases.map((b) => ({ valeur: b.id, libelle: b.nom }))
  const remplacer = (i: number, b: Bande) => p.changer(p.bandes.map((x, j) => (j === i ? b : x)))
  return (
    <>
      {p.bandes.map((b, i) => {
        const schema = etat.bases.get(b.base)?.depot?.schema
        const dates = schema ? colonnesDates(schema) : []
        return (
          <div key={i} className="reglages-niveau">
            <Reglage libelle="Base">
              <span className="controles-reglage">
                <Choix
                  valeur={b.base}
                  entrees={entreesBases}
                  libelle="Base des bandes"
                  inconnue={`${b.base} (disparue)`}
                  changer={(v) => {
                    const cible = bases.find((x) => x.id === v)
                    if (cible) remplacer(i, bandeParDefaut(v, cible))
                  }}
                />
                <button
                  className="discret retirer"
                  title="Retirer ces bandes"
                  aria-label="Retirer ces bandes"
                  onClick={() => p.changer(p.bandes.filter((_, j) => j !== i))}
                >
                  <Icone de={X} taille={14} />
                </button>
              </span>
            </Reglage>
            {schema && (
              <>
                <Reglage libelle="Début">
                  <Choix
                    valeur={b.champDebut ?? ''}
                    entrees={entreesAvecVide('aucune date', dates)}
                    libelle="Début des bandes"
                    inconnue={`${b.champDebut} (disparue)`}
                    changer={(v) => remplacer(i, { ...b, champDebut: v || undefined })}
                  />
                </Reglage>
                <Reglage libelle="Fin">
                  <Choix
                    valeur={b.champFin ?? ''}
                    entrees={entreesAvecVide(
                      'pas de fin (un seul jour)',
                      dates.filter((c) => c.cle !== b.champDebut),
                    )}
                    libelle="Fin des bandes"
                    inconnue={`${b.champFin} (disparue)`}
                    changer={(v) => remplacer(i, { ...b, champFin: v || undefined })}
                  />
                </Reglage>
                <ChoixCouleur schema={schema} reglage={b} changer={(m) => remplacer(i, { ...b, ...m })} />
                <Reglage libelle="Titres">
                  <Choix
                    valeur={b.titres ?? 'haut'}
                    entrees={[
                      { valeur: 'haut', libelle: 'en haut' },
                      { valeur: 'bas', libelle: 'en bas' },
                    ]}
                    libelle="Place des titres des bandes"
                    changer={(v) => {
                      const { titres: _, ...reste } = b
                      remplacer(i, v === 'bas' ? { ...reste, titres: 'bas' } : reste)
                    }}
                  />
                </Reglage>
              </>
            )}
          </div>
        )
      })}
      {bases.length === 0 ? (
        <div className="discret aide-reglage">Aucune base n'a de colonne date.</div>
      ) : (
        <Choix
          valeur=""
          entrees={entreesBases}
          vide="Ajouter des bandes"
          libelle="Ajouter des bandes"
          changer={(v) => {
            const cible = bases.find((x) => x.id === v)
            if (cible) p.changer([...p.bandes, bandeParDefaut(v, cible)])
          }}
        />
      )}
    </>
  )
}

/** Tableau et timeline : sous-groupe dans chaque groupe (`sous_groupe`), proposé une fois la vue groupée. */
function ReglageSousGroupe({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  if (!vue.groupe) return null
  return (
    <Reglage libelle="Puis par">
      <Choix
        valeur={vue.sousGroupe ?? ''}
        entrees={entreesAvecVide('pas de sous-groupe', groupables(schema).filter((c) => c.cle !== vue.groupe))}
        libelle="Sous-groupe"
        inconnue={`${vue.sousGroupe} (disparue)`}
        changer={(v) => modifier({ sousGroupe: v || undefined })}
      />
    </Reglage>
  )
}

/** Colonnes affichées sous le titre d'une carte, d'une case du calendrier ou d'une barre (`champs_carte`), dans l'ordre du schéma. */
function ChampsAffiches({ schema, vue, modifier, titre, titreMasquable }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void; titre: string; titreMasquable?: boolean }) {
  const champs = new Set(vue.champsCarte ?? [])
  // Timeline : le titre se retire aussi (la légende et l'infobulle le donnent).
  const colTitre = titreMasquable ? schema.colonnes.find((c) => c.cle === schema.champTitre) : undefined
  return (
    <Section titre={titre}>
      {colTitre && <Visibilite libelle={colTitre.nom} icone={ICONES[colTitre.type]} visible={vue.sansTitre !== true} changer={(v) => modifier({ sansTitre: !v })} />}
      {schema.colonnes
        .filter((c) => c.cle !== schema.champTitre)
        .map((c) => (
          <Visibilite
            key={c.cle}
            libelle={c.nom}
            icone={ICONES[c.type]}
            visible={champs.has(c.cle)}
            // Dans l'ordre du schéma.
            changer={(v) => modifier({ champsCarte: basculerCle(schema.colonnes, champs, c.cle, v) })}
          />
        ))}
    </Section>
  )
}
