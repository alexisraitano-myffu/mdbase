import {
  columnResizingFeature,
  columnSizingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { colonne as colonneDuSchema, type Colonne } from '../core/schema'
import { Cellule } from './cellules'
import { useLignes } from './useDepot'

const HAUTEUR_LIGNE = 34

const fonctionnalites = tableFeatures({ columnSizingFeature, columnResizingFeature })

const ICONES: Record<Colonne['type'], string> = {
  text: 'Aa',
  number: '#',
  date: '▦',
  checkbox: '☑',
  select: '◉',
  multiselect: '☰',
  url: '🔗',
  relation: '↗',
  rollup: '∑',
  formula: 'ƒ',
}

/** Vue tableau d'une base (spec §7) : lignes virtualisées, édition dans les cellules. */
export function Tableau({ depot }: { depot: DepotBase }) {
  const lignes = useLignes(depot)
  const [aEditer, setAEditer] = useState<string | null>(null)
  const defilement = useRef<HTMLDivElement>(null)

  const colonnes = useMemo<ColumnDef<typeof fonctionnalites, LigneChargee>[]>(
    () =>
      depot.schema.colonnes.map((c) => ({
        id: c.cle,
        header: c.nom,
        size: c.cle === depot.schema.champTitre ? 260 : 180,
      })),
    [depot.schema],
  )
  const colonneDe = (id: string) => colonneDuSchema(depot.schema, id)!

  const table = useTable({
    features: fonctionnalites,
    data: lignes as LigneChargee[],
    columns: colonnes,
    getRowId: (l) => l.chemin,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 60 },
  })
  const rangees = table.getRowModel().rows

  const virtuel = useVirtualizer({
    count: rangees.length,
    getScrollElement: () => defilement.current,
    estimateSize: () => HAUTEUR_LIGNE,
    overscan: 12,
  })

  useEffect(() => {
    if (aEditer) virtuel.scrollToIndex(rangees.length - 1)
  }, [aEditer, rangees.length, virtuel])

  async function nouvelleLigne() {
    const ligne = await depot.creer()
    setAEditer(ligne.chemin)
  }

  const largeur = table.getTotalSize()

  return (
    <div className="tableau" ref={defilement}>
      <div style={{ width: largeur + 40 }}>
        <div className="entete">
          {table.getFlatHeaders().map((h) => {
            const c = colonneDe(h.column.id)
            return (
              <div key={h.id} className="cellule-entete" style={{ width: h.getSize() }}>
                <span className="icone">{ICONES[c.type]}</span>
                {c.nom}
                <div
                  className={`poignee ${h.column.getIsResizing() ? 'active' : ''}`}
                  onMouseDown={h.getResizeHandler()}
                  onDoubleClick={() => h.column.resetSize()}
                />
              </div>
            )
          })}
        </div>

        <div style={{ height: virtuel.getTotalSize(), position: 'relative' }}>
          {virtuel.getVirtualItems().map((v) => {
            const rangee = rangees[v.index]!
            return (
              <div
                key={rangee.id}
                className="rangee"
                style={{ transform: `translateY(${v.start}px)`, height: HAUTEUR_LIGNE }}
              >
                {rangee.getAllCells().map((cell) => (
                  <div key={cell.id} className="case" style={{ width: cell.column.getSize() }}>
                    <Cellule
                      depot={depot}
                      ligne={rangee.original}
                      colonne={colonneDe(cell.column.id)}
                      editionInitiale={rangee.id === aEditer && cell.column.id === depot.schema.champTitre}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <button className="nouvelle-ligne" onClick={nouvelleLigne}>
          + Nouvelle ligne
        </button>
      </div>
    </div>
  )
}
