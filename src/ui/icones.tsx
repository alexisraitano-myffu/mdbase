import {
  ArrowUpRight,
  Calendar,
  CalendarDays,
  ChartGantt,
  CircleDot,
  Hash,
  LayoutGrid,
  Link,
  List,
  Sigma,
  SquareCheck,
  SquareFunction,
  SquareKanban,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import type { Colonne } from '../core/schema'
import type { TypeVue } from '../core/vue'

// Icônes de l'interface : Lucide, embarquée dans le build (aucun appel réseau).

export const ICONES: Record<Colonne['type'], LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: SquareCheck,
  select: CircleDot,
  multiselect: List,
  url: Link,
  relation: ArrowUpRight,
  rollup: Sigma,
  formula: SquareFunction,
}

export const ICONES_VUES: Record<TypeVue, LucideIcon> = {
  tableau: Table2,
  kanban: SquareKanban,
  collection: LayoutGrid,
  calendrier: CalendarDays,
  timeline: ChartGantt,
}

/** Une icône à la taille du texte, alignée comme l'ancien glyphe `.icone`. */
export function Icone(p: { de: LucideIcon; className?: string; taille?: number }) {
  const I = p.de
  return <I className={`icone ${p.className ?? ''}`} size={p.taille ?? 15} strokeWidth={1.75} aria-hidden />
}
