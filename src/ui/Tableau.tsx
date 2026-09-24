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
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import type { Tri } from '../core/vue'
import { colonne as colonneDuSchema } from '../core/schema'
import { useLancer } from './actions'
import { Cellule } from './cellules'
import { AjoutColonne, ICONES, MenuColonne } from './EnteteColonne'

const HAUTEUR_LIGNE = 34

const fonctionnalites = tableFeatures({ columnSizingFeature, columnResizingFeature })

/** Vue tableau d'une base (spec §7) : lignes virtualisées, édition dans les cellules. */
type Props = {
  espace: DepotEspace
  base: string
  depot: DepotBase
  /** Lignes déjà filtrées et triées par la vue. */
  lignesVue: LigneVue[]
  tris: Tri[]
  /** Valeurs héritées des filtres actifs pour une nouvelle ligne (spec §8). */
  valeursCreation: () => Modifications
  /** Garde une ligne visible après création ou modification, même hors filtres. */
  retenir: (id: string) => void
}

export function Tableau({ espace, base, depot, lignesVue, tris, valeursCreation, retenir }: Props) {
  const lignes = useMemo(() => lignesVue.map((l) => l.ligne), [lignesVue])
  const sortira = useMemo(() => new Set(lignesVue.filter((l) => l.sortira).map((l) => l.ligne.id)), [lignesVue])
  const lancer = useLancer()
  const [aEditer, setAEditer] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ cle: string; ancre: HTMLElement } | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
  const creerOption = async (cle: string, label: string) => (await espace.ajouterOption(base, cle, label)).label
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
    data: lignes,
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
    const ligne = await lancer(espace.creerLigne(base, valeursCreation()))
    if (!ligne) return
    retenir(ligne.id)
    setAEditer(ligne.chemin)
  }

  const deposer = (cle: string, cible: string) => {
    const index = depot.schema.colonnes.findIndex((c) => c.cle === cible)
    if (cle !== cible && index >= 0) void lancer(espace.deplacerColonne(base, cle, index))
  }

  const largeur = table.getTotalSize()

  return (
    <div className="tableau" ref={defilement}>
      <div style={{ width: largeur + 80 }}>
        <div className="entete">
          {table.getFlatHeaders().map((h) => {
            const c = colonneDe(h.column.id)
            return (
              <div
                key={h.id}
                className={`cellule-entete ${survol === c.cle ? 'cible' : ''}`}
                style={{ width: h.getSize() }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setSurvol(c.cle)
                }}
                onDragLeave={() => setSurvol(null)}
                onDrop={(e) => {
                  setSurvol(null)
                  deposer(e.dataTransfer.getData('text/colonne'), c.cle)
                }}
              >
                <span
                  className="libelle-entete"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/colonne', c.cle)}
                  onClick={(e) => setMenu({ cle: c.cle, ancre: e.currentTarget.parentElement! })}
                >
                  <span className="icone">{ICONES[c.type]}</span>
                  {c.nom}
                  {tris.find((t) => t.colonne === c.cle) && (
                    <span className="indicateur-tri">{tris.find((t) => t.colonne === c.cle)!.sens === 'asc' ? ' ↑' : ' ↓'}</span>
                  )}
                </span>
                <div
                  className={`poignee ${h.column.getIsResizing() ? 'active' : ''}`}
                  onMouseDown={h.getResizeHandler()}
                  onDoubleClick={() => h.column.resetSize()}
                />
              </div>
            )
          })}
          <AjoutColonne espace={espace} base={base} />
        </div>
        {menu && colonneDuSchema(depot.schema, menu.cle) && (
          <MenuColonne
            key={menu.cle}
            espace={espace}
            base={base}
            depot={depot}
            colonne={colonneDuSchema(depot.schema, menu.cle)!}
            ancre={menu.ancre}
            fermer={() => setMenu(null)}
          />
        )}

        <div style={{ height: virtuel.getTotalSize(), position: 'relative' }}>
          {virtuel.getVirtualItems().map((v) => {
            const rangee = rangees[v.index]!
            return (
              <div
                key={rangee.id}
                className={`rangee ${sortira.has(rangee.original.id) ? 'sortira' : ''}`}
                title={sortira.has(rangee.original.id) ? 'Sortira de la vue au prochain rafraîchissement' : undefined}
                style={{ transform: `translateY(${v.start}px)`, height: HAUTEUR_LIGNE }}
              >
                {rangee.getAllCells().map((cell) => (
                  <div key={cell.id} className="case" style={{ width: cell.column.getSize() }}>
                    <Cellule
                      depot={depot}
                      ligne={rangee.original}
                      colonne={colonneDe(cell.column.id)}
                      editionInitiale={rangee.id === aEditer && cell.column.id === depot.schema.champTitre}
                      creerOption={creerOption}
                      surModification={() => retenir(rangee.original.id)}
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
