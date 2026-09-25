import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import type { Vue } from '../core/vue'
import { useLancer } from './actions'
import { Carte } from './Carte'
import { Pastille } from './cellules'
import { titreDe, useEspace } from './contexte-espace'
import { Plus } from 'lucide-react'
import { Icone } from './icones'

/** Colonnes qui peuvent porter les colonnes d'un kanban (spec §7). */
export const TYPES_GROUPE_KANBAN: readonly Colonne['type'][] = ['select', 'checkbox', 'relation', 'multiselect']

type Props = {
  espace: DepotEspace
  base: string
  depot: DepotBase
  vue: Vue
  lignesVue: LigneVue[]
  valeursCreation: () => Modifications
  retenir: (id: string) => void
  ouvrir: (ligne: LigneChargee) => void
}

type Position = { couloir: Groupe; groupe: Groupe }

/**
 * Kanban (spec §7) : une colonne par valeur du champ de groupe, couloirs
 * optionnels par sous-groupe. Glisser une carte change sa valeur ; le « + »
 * d'une colonne crée une ligne qui en porte la valeur (§8).
 */
export function Kanban({ espace, base, depot, vue, lignesVue, valeursCreation, retenir, ouvrir }: Props) {
  const { etat } = useEspace()
  const lancer = useLancer()
  const schema = depot.schema
  const [enCours, setEnCours] = useState<LigneChargee | null>(null)
  const capteurs = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const colGroupe = vue.groupe ? colonneDe(schema, vue.groupe) : undefined
  const colCouloir = vue.sousGroupe ? colonneDe(schema, vue.sousGroupe) : undefined
  const champs = (vue.champsCarte ?? []).flatMap((c) => colonneDe(schema, c) ?? [])
  const titre = (c: Colonne) => (id: string) => (c.type === 'relation' ? titreDe(etat, c.cible, id) : null)

  const { groupes, couloirs } = useMemo(() => {
    if (!colGroupe) return { groupes: [], couloirs: [] }
    const groupes = grouper(lignesVue, colGroupe, titre(colGroupe), true)
    const couloirs: Groupe[] = colCouloir
      ? grouper(lignesVue, colCouloir, titre(colCouloir))
      : [{ cle: '*', libelle: '', lignes: lignesVue }]
    return { groupes, couloirs }
    // `etat` : les titres des relations suivent les renommages.
  }, [lignesVue, colGroupe, colCouloir, etat])

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

  const finir = (e: DragEndEvent) => {
    setEnCours(null)
    const de = e.active.data.current as (Position & { ligne: LigneChargee }) | undefined
    const vers = e.over?.data.current as Position | undefined
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
      onDragStart={(e: DragStartEvent) => setEnCours((e.active.data.current as { ligne: LigneChargee }).ligne)}
      onDragEnd={finir}
      onDragCancel={() => setEnCours(null)}
    >
      <div className="kanban">
        <div className="kanban-entetes">
          {groupes.map((g) => (
            <div key={g.cle} className="kanban-entete">
              {(colGroupe.type === 'select' || colGroupe.type === 'multiselect') && g.cle !== '∅' ? (
                <Pastille label={g.libelle} couleur={g.couleur} />
              ) : (
                <span className="libelle-groupe">{g.libelle}</span>
              )}
              <span className="discret compte-groupe">{g.lignes.length}</span>
            </div>
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
                  <ColonneKanban key={groupe.cle} position={{ couloir, groupe }} creer={creer}>
                    {lignes.map((lv) => (
                      <CarteGlissable key={lv.ligne.chemin} position={{ couloir, groupe }} ligne={lv.ligne}>
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
      </DragOverlay>
    </DndContext>
  )
}

function ColonneKanban({ position, creer, children }: { position: Position; creer: (p: Position) => void; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${position.couloir.cle}|${position.groupe.cle}`, data: position })
  return (
    <div ref={setNodeRef} className={`kanban-colonne ${isOver ? 'cible' : ''}`}>
      <button className="discret ajout-carte" onClick={() => creer(position)}>
        <Icone de={Plus} /> Nouvelle
      </button>
      {children}
    </div>
  )
}

function CarteGlissable({ position, ligne, children }: { position: Position; ligne: LigneChargee; children: ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${position.couloir.cle}|${position.groupe.cle}|${ligne.chemin}`,
    data: { ...position, ligne },
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? 'carte-fantome' : undefined}>
      {children}
    </div>
  )
}
