import {
  columnResizingFeature,
  columnSizingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import { colonnesDeLaVue, grouper, type Groupe } from '../core/groupes'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDuSchema, type Calcul, type Colonne } from '../core/schema'
import type { ModificationVue, Tri, Vue } from '../core/vue'
import { useLancer } from './actions'
import { Cellule, Pastille } from './cellules'
import { titreDe, useEspace } from './contexte-espace'
import { AjoutColonne, ICONES, MenuColonne } from './EnteteColonne'
import { PiedTableau } from './PiedTableau'

const HAUTEUR_LIGNE = 34
const HAUTEUR_GROUPE = 40
const LARGEUR_DEFAUT = 180
const LARGEUR_TITRE = 260

const fonctionnalites = tableFeatures({ columnSizingFeature, columnResizingFeature })

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
  /** Colonnes à afficher (onglet relation) ; toutes par défaut. Ignoré si `reglages` est fourni. */
  colonnesVisibles?: readonly string[]
  /** Ouvre la page d'une ligne (bouton « Ouvrir » sur le titre). */
  ouvrir?: (ligne: LigneChargee) => void
  /**
   * Réglages de la vue et leur modification : ordre et masquage des colonnes,
   * largeurs, retour à la ligne, groupement, calculs de pied. Absents (onglet
   * relation), le tableau reste simple.
   */
  reglages?: { vue: Vue; modifier: (m: ModificationVue) => void }
}

/** Ce que la liste virtualisée affiche, ligne après ligne. */
type Element =
  | { type: 'groupe'; groupe: Groupe; replie: boolean }
  | { type: 'ligne'; lv: LigneVue; groupe?: string }
  | { type: 'ajout'; groupe: Groupe }
  | { type: 'pied'; groupe: Groupe }

/** Vue tableau d'une base (spec §7) : lignes virtualisées, édition dans les cellules. */
export function Tableau(p: Props) {
  const { espace, base, depot, lignesVue, tris, retenir, ouvrir, reglages } = p
  const { etat } = useEspace()
  const lancer = useLancer()
  const [aEditer, setAEditer] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ cle: string; ancre: HTMLElement } | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const creerOption = async (cle: string, label: string) => (await espace.ajouterOption(base, cle, label)).label
  const defilement = useRef<HTMLDivElement>(null)
  const vue = reglages?.vue

  // Colonnes affichées : celles de la vue, sinon la liste demandée, sinon toutes.
  const visibles = useMemo<Colonne[]>(() => {
    if (vue) return colonnesDeLaVue(depot.schema, vue).visibles
    return depot.schema.colonnes.filter((c) => !p.colonnesVisibles || p.colonnesVisibles.includes(c.cle))
  }, [depot.schema, vue, p.colonnesVisibles])

  // Largeurs : état local pendant le redimensionnement, enregistrées dans la vue un instant après.
  const [largeurs, setLargeurs] = useState<Record<string, number>>(() => vue?.largeurs ?? {})
  useEffect(() => {
    if (!reglages || JSON.stringify(largeurs) === JSON.stringify(reglages.vue.largeurs ?? {})) return
    const t = setTimeout(() => reglages.modifier({ largeurs }), 600)
    return () => clearTimeout(t)
  }, [largeurs, reglages])

  const colonnes = useMemo<ColumnDef<typeof fonctionnalites, LigneChargee>[]>(
    () =>
      visibles.map((c) => ({
        id: c.cle,
        header: c.nom,
        size: c.cle === depot.schema.champTitre ? LARGEUR_TITRE : LARGEUR_DEFAUT,
      })),
    [visibles, depot.schema.champTitre],
  )
  const colonneDe = (id: string) => colonneDuSchema(depot.schema, id)!

  const lignes = useMemo(() => lignesVue.map((l) => l.ligne), [lignesVue])
  const table = useTable({
    features: fonctionnalites,
    data: lignes,
    columns: colonnes,
    getRowId: (l) => l.chemin,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 60 },
    state: { columnSizing: largeurs },
    onColumnSizingChange: (u: Updater<Record<string, number>>) => setLargeurs((avant) => (typeof u === 'function' ? u(avant) : u)),
  })
  const entetes = table.getFlatHeaders()
  const tailles = entetes.map((h) => ({ colonne: colonneDe(h.column.id), largeur: h.getSize() }))

  // Groupement (spec §7) : en-tête repliable, lignes, « + » du groupe, pied du groupe.
  const colonneGroupe = vue?.groupe ? colonneDuSchema(depot.schema, vue.groupe) : undefined
  const calculs = vue?.calculs ?? {}
  const aDesCalculs = Object.keys(calculs).length > 0
  const elements = useMemo<Element[]>(() => {
    if (!colonneGroupe) return lignesVue.map((lv) => ({ type: 'ligne', lv }))
    const cible = colonneGroupe.type === 'relation' ? colonneGroupe.cible : null
    const groupes = grouper(lignesVue, colonneGroupe, (id) => (cible ? titreDe(etat, cible, id) : null))
    return groupes.flatMap((g): Element[] => {
      const replie = replies.has(g.cle)
      if (replie) return [{ type: 'groupe', groupe: g, replie }]
      return [
        { type: 'groupe', groupe: g, replie },
        ...g.lignes.map((lv): Element => ({ type: 'ligne', lv, groupe: g.cle })),
        { type: 'ajout', groupe: g },
        ...(aDesCalculs ? [{ type: 'pied', groupe: g } as Element] : []),
      ]
    })
  }, [lignesVue, colonneGroupe, replies, aDesCalculs, etat])

  const retourLigne = vue?.retourLigne === true
  const virtuel = useVirtualizer({
    count: elements.length,
    getScrollElement: () => defilement.current,
    estimateSize: (i) => (elements[i]?.type === 'groupe' ? HAUTEUR_GROUPE : HAUTEUR_LIGNE),
    overscan: 12,
  })

  useEffect(() => {
    if (!aEditer) return
    const i = elements.findIndex((e) => e.type === 'ligne' && e.lv.ligne.chemin === aEditer)
    if (i >= 0) virtuel.scrollToIndex(i)
  }, [aEditer, elements, virtuel])

  async function nouvelleLigne(groupe?: Groupe) {
    const valeurs = { ...p.valeursCreation() }
    // « + » d'un groupe : la ligne prend la valeur du groupe (spec §8).
    if (groupe && colonneGroupe && groupe.valeur !== undefined) valeurs[colonneGroupe.cle] = groupe.valeur
    const ligne = await lancer(espace.creerLigne(base, valeurs))
    if (!ligne) return
    retenir(ligne.id)
    setAEditer(ligne.chemin)
  }

  // Glisser un en-tête réordonne la vue (pas le schéma).
  const deposer = (cle: string, cible: string) => {
    if (!reglages || cle === cible || !cle) return
    const ordre = visibles.map((c) => c.cle).filter((c) => c !== cle)
    ordre.splice(ordre.indexOf(cible), 0, cle)
    reglages.modifier({ ordre })
  }

  const basculerGroupe = (cle: string) => {
    const s = new Set(replies)
    if (!s.delete(cle)) s.add(cle)
    setReplies(s)
  }

  return (
    <div className={`tableau ${retourLigne ? 'retour-ligne' : ''}`} ref={defilement}>
      <div style={{ width: table.getTotalSize() + 80 }}>
        <div className="entete">
          {entetes.map((h) => {
            const c = colonneDe(h.column.id)
            const tri = tris.find((t) => t.colonne === c.cle)
            return (
              <div
                key={h.id}
                className={`cellule-entete ${survol === c.cle ? 'cible' : ''}`}
                style={{ width: h.getSize() }}
                onDragOver={(e) => {
                  if (!reglages) return
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
                  draggable={!!reglages}
                  onDragStart={(e) => e.dataTransfer.setData('text/colonne', c.cle)}
                  onClick={(e) => setMenu({ cle: c.cle, ancre: e.currentTarget.parentElement! })}
                >
                  <span className="icone">{ICONES[c.type]}</span>
                  {c.nom}
                  {tri && <span className="indicateur-tri">{tri.sens === 'asc' ? ' ↑' : ' ↓'}</span>}
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
            masquer={reglages && (() => reglages.modifier({ masquees: [...(reglages.vue.masquees ?? []), menu.cle] }))}
          />
        )}

        <div style={{ height: virtuel.getTotalSize(), position: 'relative' }}>
          {virtuel.getVirtualItems().map((v) => {
            const e = elements[v.index]!
            const commun = { 'data-index': v.index, ref: virtuel.measureElement, style: { transform: `translateY(${v.start}px)` } }
            if (e.type === 'groupe') {
              return (
                <div key={`g:${e.groupe.cle}`} {...commun} className="rangee-groupe" onClick={() => basculerGroupe(e.groupe.cle)}>
                  <span className="triangle">{e.replie ? '▸' : '▾'}</span>
                  {colonneGroupe && (colonneGroupe.type === 'select' || colonneGroupe.type === 'multiselect') && e.groupe.cle !== '∅' ? (
                    <Pastille label={e.groupe.libelle} couleur={e.groupe.couleur} />
                  ) : (
                    <span className="libelle-groupe">{e.groupe.libelle}</span>
                  )}
                  <span className="discret compte-groupe">{e.groupe.lignes.length}</span>
                </div>
              )
            }
            if (e.type === 'ajout') {
              return (
                <div key={`a:${e.groupe.cle}`} {...commun} className="rangee-ajout">
                  <button className="nouvelle-ligne" onClick={() => void nouvelleLigne(e.groupe)}>
                    + Nouvelle ligne
                  </button>
                </div>
              )
            }
            if (e.type === 'pied') {
              return (
                <div key={`p:${e.groupe.cle}`} {...commun} className="rangee-pied">
                  <PiedTableau colonnes={tailles} lignes={e.groupe.lignes.map((l) => l.ligne)} calculs={calculs} />
                </div>
              )
            }
            const ligne = e.lv.ligne
            return (
              <div
                key={`${e.groupe ?? ''}/${ligne.chemin}`}
                {...commun}
                className={`rangee ${e.lv.sortira ? 'sortira' : ''}`}
                title={e.lv.sortira ? 'Sortira de la vue au prochain rafraîchissement' : undefined}
              >
                {tailles.map(({ colonne, largeur }) => (
                  <div key={colonne.cle} className="case" style={{ width: largeur }}>
                    {ouvrir && colonne.cle === depot.schema.champTitre && (
                      <button className="bouton-ouvrir" onClick={() => ouvrir(ligne)}>
                        Ouvrir
                      </button>
                    )}
                    <Cellule
                      depot={depot}
                      ligne={ligne}
                      colonne={colonne}
                      editionInitiale={ligne.chemin === aEditer && colonne.cle === depot.schema.champTitre}
                      creerOption={creerOption}
                      surModification={() => retenir(ligne.id)}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {!colonneGroupe && (
          <button className="nouvelle-ligne" onClick={() => void nouvelleLigne()}>
            + Nouvelle ligne
          </button>
        )}
        {reglages && (
          <PiedTableau
            colonnes={tailles}
            lignes={lignes}
            calculs={calculs}
            changer={(cle, calcul?: Calcul) => {
              const suivants = { ...calculs }
              if (calcul) suivants[cle] = calcul
              else delete suivants[cle]
              reglages.modifier({ calculs: suivants })
            }}
          />
        )}
      </div>
    </div>
  )
}
