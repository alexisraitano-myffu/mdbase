import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMemo, useState, type ReactNode } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import { grouper, valeurApresDeplacement, type Groupe } from '../core/groupes'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDe, type Colonne } from '../core/schema'
import type { ModificationVue, Vue } from '../core/vue'
import { useLancer } from './actions'
import { Carte } from './Carte'
import { Pastille } from './cellules'
import { titreDe, useEspace } from './contexte-espace'
import { Plus } from 'lucide-react'
import { Icone } from './icones'
import { useConsultation } from './mode'

/** Colonnes qui peuvent porter les colonnes d'un kanban (spec §7). */
export const TYPES_GROUPE_KANBAN: readonly Colonne['type'][] = ['select', 'checkbox', 'relation', 'multiselect']

type Props = {
  espace: DepotEspace
  base: string
  depot: DepotBase
  vue: Vue
  modifierVue: (m: ModificationVue) => void
  lignesVue: LigneVue[]
  valeursCreation: () => Modifications
  retenir: (id: string) => void
  ouvrir: (ligne: LigneChargee) => void
}

type Position = { couloir: Groupe; groupe: Groupe }
/** En-tête de colonne glissé, ou survolé : sa clé de groupe. */
type Entete = { entete: string }

/**
 * Kanban (spec §7) : une colonne par valeur du champ de groupe, couloirs
 * optionnels par sous-groupe. Glisser une carte change sa valeur ; le « + »
 * d'une colonne crée une ligne qui en porte la valeur (§8). Glisser l'en-tête
 * d'une colonne sur un autre l'y place : l'ordre est écrit dans la vue.
 */
export function Kanban({ espace, base, depot, vue, modifierVue, lignesVue, valeursCreation, retenir, ouvrir }: Props) {
  const lecture = useConsultation()
  const { etat } = useEspace()
  const lancer = useLancer()
  const schema = depot.schema
  const [enCours, setEnCours] = useState<LigneChargee | null>(null)
  const [enteteEnCours, setEnteteEnCours] = useState<string | null>(null)
  /** Ordre des colonnes pendant qu'on glisse un en-tête : la colonne prend sa place avant d'être lâchée. */
  const [apercu, setApercu] = useState<string[] | null>(null)
  const capteurs = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const colGroupe = vue.groupe ? colonneDe(schema, vue.groupe) : undefined
  const colCouloir = vue.sousGroupe ? colonneDe(schema, vue.sousGroupe) : undefined
  const champs = (vue.champsCarte ?? []).flatMap((c) => colonneDe(schema, c) ?? [])
  const titre = (c: Colonne) => (id: string) => (c.type === 'relation' ? titreDe(etat, c.cible, id) : null)

  const { groupes, couloirs } = useMemo(() => {
    if (!colGroupe) return { groupes: [], couloirs: [] }
    const groupes = grouper(lignesVue, colGroupe, titre(colGroupe), true, undefined, apercu ?? vue.ordreGroupes)
    const couloirs: Groupe[] = colCouloir
      ? grouper(lignesVue, colCouloir, titre(colCouloir))
      : [{ cle: '*', libelle: '', lignes: lignesVue }]
    return { groupes, couloirs }
    // `etat` : les titres des relations suivent les renommages.
  }, [lignesVue, colGroupe, colCouloir, etat, vue.ordreGroupes, apercu])

  if (!colGroupe || !TYPES_GROUPE_KANBAN.includes(colGroupe.type)) {
    return <p className="discret">Choisis la colonne qui forme les colonnes du kanban dans « Options ».</p>
  }

  /** Change la valeur d'une colonne après un déplacement, par le bon chemin (relation non propriétaire comprise). */
  const deplacer = (ligne: LigneChargee, colonne: Colonne, depuis: Groupe, vers: Groupe) => {
    if (depuis.cle === vers.cle) return
    const actuelle = ligne.cellules[colonne.cle]
    const nouvelle = valeurApresDeplacement(colonne, actuelle?.etat === 'ok' ? actuelle.valeur : undefined, depuis.cle, vers)
    retenir(ligne.id)
    if (colonne.type === 'relation') {
      void lancer(Promise.resolve().then(() => espace.modifierRelation(base, ligne.id, colonne.cle, Array.isArray(nouvelle) ? nouvelle : [])))
    } else {
      depot.modifier(ligne.chemin, colonne.cle, nouvelle)
    }
  }

  /** Ordre des colonnes où l'en-tête glissé prend la place de celui qu'il survole. */
  const rangees = (cle: string, cible: string) => {
    const cles = groupes.map((g) => g.cle).filter((k) => k !== cle)
    const avant = groupes.findIndex((g) => g.cle === cle) < groupes.findIndex((g) => g.cle === cible)
    cles.splice(cles.indexOf(cible) + (avant ? 1 : 0), 0, cle)
    return cles
  }

  const survoler = (e: DragOverEvent) => {
    const actif = e.active.data.current as Entete | undefined
    const survol = e.over?.data.current as Entete | undefined
    if (!actif || !('entete' in actif) || !survol || !('entete' in survol) || actif.entete === survol.entete) return
    setApercu(rangees(actif.entete, survol.entete))
  }

  const finir = (e: DragEndEvent) => {
    setEnCours(null)
    setEnteteEnCours(null)
    const actif = e.active.data.current as (Position & { ligne: LigneChargee }) | Entete | undefined
    const survol = e.over?.data.current as Position | Entete | undefined
    if (actif && 'entete' in actif) {
      // L'aperçu est déjà dans l'ordre voulu : il est écrit dans la vue (lâché hors d'un en-tête, rien ne change).
      if (apercu && survol && 'entete' in survol) modifierVue({ ordreGroupes: apercu })
      setApercu(null)
      return
    }
    const de = actif
    const vers = survol && 'groupe' in survol ? survol : undefined
    if (!de || !vers) return
    deplacer(de.ligne, colGroupe, de.groupe, vers.groupe)
    if (colCouloir) deplacer(de.ligne, colCouloir, de.couloir, vers.couloir)
  }

  const creer = async ({ couloir, groupe }: Position) => {
    const valeurs = { ...valeursCreation() }
    if (groupe.valeur !== undefined) valeurs[colGroupe.cle] = groupe.valeur
    if (colCouloir && couloir.valeur !== undefined) valeurs[colCouloir.cle] = couloir.valeur
    const ligne = await lancer(espace.creerLigne(base, valeurs))
    if (!ligne) return
    retenir(ligne.id)
    ouvrir(ligne)
  }

  const idsParCouloir = new Map(couloirs.map((c) => [c.cle, new Set(c.lignes.map((l) => l.ligne.id))]))

  return (
    <DndContext
      sensors={capteurs}
      onDragStart={(e: DragStartEvent) => {
        const d = e.active.data.current as { ligne: LigneChargee } | Entete
        if ('entete' in d) setEnteteEnCours(d.entete)
        else setEnCours(d.ligne)
      }}
      onDragOver={survoler}
      onDragEnd={finir}
      onDragCancel={() => {
        setEnCours(null)
        setEnteteEnCours(null)
        setApercu(null)
      }}
    >
      <div className="kanban">
        <div className="kanban-entetes">
          {groupes.map((g) => (
            <EnteteGlissable key={g.cle} cle={g.cle} fixe={lecture}>
              <LibelleGroupe groupe={g} colonne={colGroupe} />
            </EnteteGlissable>
          ))}
        </div>
        {couloirs.map((couloir) => (
          <div key={couloir.cle} className="couloir">
            {colCouloir && (
              <div className="titre-couloir">
                {couloir.libelle} <span className="discret compte-groupe">{couloir.lignes.length}</span>
              </div>
            )}
            <div className="kanban-colonnes">
              {groupes.map((groupe) => {
                const ids = idsParCouloir.get(couloir.cle)!
                const lignes = groupe.lignes.filter((l) => ids.has(l.ligne.id))
                return (
                  <ColonneKanban key={groupe.cle} position={{ couloir, groupe }} creer={lecture ? undefined : creer}>
                    {lignes.map((lv) => (
                      <CarteGlissable key={lv.ligne.chemin} position={{ couloir, groupe }} ligne={lv.ligne} fixe={lecture}>
                        <Carte base={base} schema={schema} ligne={lv.ligne} champs={champs} sortira={lv.sortira} ouvrir={() => ouvrir(lv.ligne)} />
                      </CarteGlissable>
                    ))}
                  </ColonneKanban>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <DragOverlay>
        {enCours && (
          <div className="carte-deplacee">
            <Carte base={base} schema={schema} ligne={enCours} champs={champs} ouvrir={() => {}} />
          </div>
        )}
        {enteteEnCours !== null && (
          <div className="kanban-entete entete-deplace">
            {(() => {
              const g = groupes.find((x) => x.cle === enteteEnCours)
              return g && <LibelleGroupe groupe={g} colonne={colGroupe} />
            })()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function ColonneKanban({ position, creer, children }: { position: Position; creer: ((p: Position) => void) | undefined; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${position.couloir.cle}|${position.groupe.cle}`, data: position })
  return (
    <div ref={setNodeRef} className={`kanban-colonne ${isOver ? 'cible' : ''}`}>
      {creer && (
        <button className="discret ajout-carte" onClick={() => creer(position)}>
          <Icone de={Plus} /> Nouvelle
        </button>
      )}
      {children}
    </div>
  )
}

/** Carte qui se glisse d'une colonne à l'autre ; `fixe` en consultation. */
function CarteGlissable({ position, ligne, fixe, children }: { position: Position; ligne: LigneChargee; fixe: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${position.couloir.cle}|${position.groupe.cle}|${ligne.chemin}`,
    data: { ...position, ligne },
    disabled: fixe,
  })
  return (
    // Fixe : sans les attributs de dnd-kit, qui la marqueraient « désactivée » pour les lecteurs d'écran.
    <div ref={setNodeRef} {...(!fixe && { ...listeners, ...attributes })} className={isDragging ? 'carte-fantome' : undefined}>
      {children}
    </div>
  )
}

function LibelleGroupe({ groupe: g, colonne }: { groupe: Groupe; colonne: Colonne }) {
  return (
    <>
      {(colonne.type === 'select' || colonne.type === 'multiselect') && g.cle !== '∅' ? (
        <Pastille label={g.libelle} couleur={g.couleur} />
      ) : (
        <span className="libelle-groupe">{g.libelle}</span>
      )}
      <span className="discret compte-groupe">{g.lignes.length}</span>
    </>
  )
}

/** En-tête de colonne : se glisse sur un autre pour changer l'ordre des colonnes ; `fixe` en consultation. */
function EnteteGlissable({ cle, fixe, children }: { cle: string; fixe: boolean; children: ReactNode }) {
  const glisse = useDraggable({ id: `entete|${cle}`, data: { entete: cle }, disabled: fixe })
  const cible = useDroppable({ id: `cible-entete|${cle}`, data: { entete: cle }, disabled: fixe })
  return (
    <div
      ref={(el) => {
        glisse.setNodeRef(el)
        cible.setNodeRef(el)
      }}
      {...(!fixe && { ...glisse.listeners, ...glisse.attributes, title: 'Glisser pour déplacer la colonne' })}
      // Pas de surlignage de la cible : les colonnes se rangent en direct pendant le glisser.
      className={`kanban-entete${fixe ? '' : ' mobile'}${glisse.isDragging ? ' entete-fantome' : ''}`}
    >
      {children}
    </div>
  )
}
