import { DndContext, DragOverlay, pointerWithin, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragOverEvent } from '@dnd-kit/core'
import { GripVertical, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CLE_VIDE, grouper, type Groupe } from '../core/groupes'
import type { Colonne, Schema } from '../core/schema'
import type { ModificationVue, Vue } from '../core/vue'
import { Pastille } from './cellules'
import { useEspace } from './contexte-espace'
import { Icone } from './icones'
import { Section } from './reglages'

// Ordre des colonnes du kanban dans « Options » (spec §7) : la liste des
// colonnes, rangée en glissant une ligne, comme le panneau « Groupes » de
// Notion. Même réglage que glisser un en-tête dans le kanban : `ordre_groupes`.

/** Colonnes possibles du kanban, dans l'ordre réglé : options, deux états d'une case, lignes liées ; le groupe vide en dernier. */
function groupesPossibles(colonne: Colonne, titres: ReadonlyMap<string, string> | undefined, ordre: readonly string[] | undefined): Groupe[] {
  const groupes = grouper([], colonne, (id) => titres?.get(id) || null, true, undefined, ordre)
  const relation = colonne.type === 'relation' ? [...(titres ?? new Map<string, string>())].map(([id, t]): Groupe => ({ cle: id, libelle: t || 'Sans titre', lignes: [] })) : []
  const vide: Groupe = { cle: CLE_VIDE, libelle: `Sans ${colonne.nom.toLowerCase()}`, lignes: [] }
  const tous = [...groupes, ...relation, vide]
  const rang = (g: Groupe) => {
    const i = (ordre ?? []).indexOf(g.cle)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  // Ordre réglé devant, puis l'ordre habituel (stable).
  return tous.map((g, i) => ({ g, i })).sort((a, b) => rang(a.g) - rang(b.g) || a.i - b.i).map((x) => x.g)
}

export function OrdreGroupes({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const { etat } = useEspace()
  const colonne = schema.colonnes.find((c) => c.cle === vue.groupe)
  const [apercu, setApercu] = useState<string[] | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const capteurs = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  if (!colonne) return null
  const titres = colonne.type === 'relation' ? etat.titres.get(colonne.cible) : undefined
  const groupes = groupesPossibles(colonne, titres, apercu ?? vue.ordreGroupes)
  const choix = colonne.type === 'select' || colonne.type === 'multiselect'

  const survoler = (e: DragOverEvent) => {
    const de = e.active.data.current as { cle: string } | undefined
    const vers = e.over?.data.current as { cle: string } | undefined
    if (!de || !vers || de.cle === vers.cle) return
    const cles = groupes.map((g) => g.cle).filter((k) => k !== de.cle)
    const avant = groupes.findIndex((g) => g.cle === de.cle) < groupes.findIndex((g) => g.cle === vers.cle)
    cles.splice(cles.indexOf(vers.cle) + (avant ? 1 : 0), 0, de.cle)
    setApercu(cles)
  }
  const libelle = (g: Groupe) => (choix && g.cle !== CLE_VIDE ? <Pastille label={g.libelle} couleur={g.couleur} /> : <span>{g.libelle}</span>)
  const glisse = groupes.find((g) => g.cle === enCours)

  return (
    <Section titre="Ordre des colonnes" aide="Glisse une ligne pour la déplacer, ou un en-tête dans le kanban.">
      <DndContext
        sensors={capteurs}
        // La ligne sous le pointeur : la ligne glissée prend sa place.
        collisionDetection={pointerWithin}
        onDragStart={(e) => setEnCours((e.active.data.current as { cle: string }).cle)}
        onDragOver={survoler}
        onDragEnd={() => {
          if (apercu) modifier({ ordreGroupes: apercu })
          setApercu(null)
          setEnCours(null)
        }}
        onDragCancel={() => {
          setApercu(null)
          setEnCours(null)
        }}
      >
        <ul className="ordre-groupes" aria-label="Ordre des colonnes">
          {groupes.map((g) => (
            <LigneOrdre key={g.cle} cle={g.cle}>
              {libelle(g)}
            </LigneOrdre>
          ))}
        </ul>
        <DragOverlay>
          {glisse && (
            <div className="ligne-ordre ligne-ordre-deplacee">
              <Icone de={GripVertical} className="poignee-ordre" />
              {libelle(glisse)}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {vue.ordreGroupes && (
        <button className="discret retablir-ordre" onClick={() => modifier({ ordreGroupes: undefined })}>
          <Icone de={RotateCcw} />
          Revenir à l’ordre {choix ? 'des options' : 'habituel'}
        </button>
      )}
    </Section>
  )
}

function LigneOrdre({ cle, children }: { cle: string; children: ReactNode }) {
  const glisse = useDraggable({ id: `ordre|${cle}`, data: { cle } })
  const cible = useDroppable({ id: `cible-ordre|${cle}`, data: { cle } })
  return (
    <li
      ref={(el) => {
        glisse.setNodeRef(el)
        cible.setNodeRef(el)
      }}
      {...glisse.listeners}
      {...glisse.attributes}
      className={`ligne-ordre${glisse.isDragging ? ' fantome' : ''}`}
    >
      <Icone de={GripVertical} className="poignee-ordre" />
      {children}
    </li>
  )
}

