import {
  columnResizingFeature,
  columnSizingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState, type PointerEvent as EvenementPointeur } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import { grilleDeVue, lireTableauColle, versHtml, versMarkdown, type Grille, type Libelle } from '../core/echange'
import type { LigneVue } from '../core/filtres'
import { colonnesDeLaVue, grouper, type Groupe } from '../core/groupes'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDuSchema, estSaisie, type Calcul, type Colonne } from '../core/schema'
import type { Valeur } from '../core/valeurs'
import type { ModificationVue, Tri, Vue } from '../core/vue'
import { useLancer } from './actions'
import { Cellule, champRemonte, Pastille } from './cellules'
import { titreDe, useEspace } from './contexte-espace'
import { AjoutColonne, MenuColonne } from './EnteteColonne'
import { FenetreImport } from './Echange'
import { Flottant } from './flottant'
import { Icone, ICONES } from './icones'
import { PiedTableau } from './PiedTableau'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, CopyPlus, Plus, Trash2, X } from 'lucide-react'

const HAUTEUR_LIGNE = 34
const HAUTEUR_GROUPE = 40
const LARGEUR_DEFAUT = 180
const LARGEUR_TITRE = 260
const LARGEUR_GOUTTIERE = 28
/** Zone près du bord où la recopie fait défiler le tableau. */
const BORD_DEFILEMENT = 40

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
  const enDouble = etat.doublons.get(depot.schema.id)
  const lancer = useLancer()
  const [aEditer, setAEditer] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ cle: string; ancre: HTMLElement } | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const creerOption = async (cle: string, label: string) => (await espace.ajouterOption(base, cle, label)).label
  const defilement = useRef<HTMLDivElement>(null)
  const vue = reglages?.vue
  // Sélection de lignes (vue principale seulement) : cases dans la gouttière, barre d'actions.
  const selectionnable = !!reglages
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const ancreSelection = useRef<string | null>(null)
  const [confirmer, setConfirmer] = useState(false)
  const [collage, setCollage] = useState<ReturnType<DepotEspace['preparerCollage']> | null>(null)
  const [recopie, setRecopie] = useState<{ cle: string; depuis: number; jusqua: number } | null>(null)

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

  // Lignes sélectionnées encore affichées, dans l'ordre de la vue.
  const choisies = useMemo(() => lignes.filter((l) => selection.has(l.chemin)), [lignes, selection])
  const ordreAffiche = useMemo(() => elements.flatMap((e) => (e.type === 'ligne' ? [e.lv.ligne.chemin] : [])), [elements])

  /** Coche ou décoche une ligne ; Maj étend la sélection depuis la dernière ligne cochée. */
  const cocher = (chemin: string, etendre: boolean) => {
    const s = new Set(selection)
    const i = ancreSelection.current ? ordreAffiche.indexOf(ancreSelection.current) : -1
    const j = ordreAffiche.indexOf(chemin)
    if (etendre && i >= 0 && j >= 0) for (const c of ordreAffiche.slice(Math.min(i, j), Math.max(i, j) + 1)) s.add(c)
    else if (!s.delete(chemin)) s.add(chemin)
    ancreSelection.current = chemin
    setSelection(s)
  }
  const toutCocher = () => setSelection(choisies.length === lignes.length ? new Set() : new Set(lignes.map((l) => l.chemin)))

  // Une cellule modifiée dans une sélection de plusieurs lignes modifie toute la sélection.
  const lot = (ligne: LigneChargee) =>
    choisies.length > 1 && selection.has(ligne.chemin)
      ? (cle: string, valeur: Valeur | undefined) => {
          for (const l of choisies) retenir(l.id)
          void lancer(espace.modifierLignes(base, choisies.map((l) => l.chemin), cle, valeur))
        }
      : undefined

  // Copie : les colonnes affichées, les relations en titres, comme l'export.
  const libelle: Libelle = (c, x) => {
    const relation = c.type === 'relation' ? c : champRemonte(etat, base, c)
    return relation?.type === 'relation' ? (titreDe(etat, relation.cible, x) ?? x) : x
  }
  const grilleChoisies = (): Grille => grilleDeVue(choisies, visibles, libelle, true)

  // Clavier et presse-papiers, hors champ en cours d'édition : Échap, Suppr, copier, coller un tableau.
  useEffect(() => {
    if (!selectionnable) return
    // Une case à cocher (celles de la sélection) n'est pas un champ de saisie.
    const editable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t.tagName) || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(t.type)))
    // Fenêtre ou menu ouvert : Échap et les raccourcis leur reviennent.
    const occupe = (t: EventTarget | null) => editable(t) || document.querySelector('.voile-fenetre, .flottant') !== null
    const touche = (e: KeyboardEvent) => {
      if (choisies.length === 0 || occupe(e.target)) return
      if (e.key === 'Escape') setSelection(new Set())
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        setConfirmer(true)
      }
    }
    const copier = (e: ClipboardEvent) => {
      if (choisies.length === 0 || occupe(e.target) || !(document.getSelection()?.isCollapsed ?? true)) return
      e.preventDefault()
      const g = grilleChoisies()
      e.clipboardData?.setData('text/plain', versMarkdown(g))
      e.clipboardData?.setData('text/html', versHtml(g))
    }
    const coller = (e: ClipboardEvent) => {
      if (occupe(e.target)) return
      const grille = lireTableauColle(e.clipboardData?.getData('text/plain') ?? '')
      // Une valeur seule n'est pas un tableau : rien à créer.
      if (grille.length < 2 && (grille[0]?.length ?? 0) < 2) return
      e.preventDefault()
      const prepare = espace.preparerCollage(base, grille, visibles.map((c) => c.cle))
      if (prepare.lignes.length > 0) setCollage(prepare)
    }
    document.addEventListener('keydown', touche)
    document.addEventListener('copy', copier)
    document.addEventListener('paste', coller)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('copy', copier)
      document.removeEventListener('paste', coller)
    }
  })

  // Recopie : la poignée d'une cellule, tirée vers le haut ou le bas, donne sa valeur aux lignes survolées.
  const plageRecopie = useMemo(() => {
    if (!recopie) return null
    const [a, b] = [Math.min(recopie.depuis, recopie.jusqua), Math.max(recopie.depuis, recopie.jusqua)]
    return new Set(elements.slice(a, b + 1).flatMap((e) => (e.type === 'ligne' ? [e.lv.ligne.chemin] : [])))
  }, [recopie, elements])

  function commencerRecopie(e: EvenementPointeur, index: number, ligne: LigneChargee, cle: string) {
    const cellule = ligne.cellules[cle]
    if (e.button !== 0 || cellule?.etat === 'invalide') return
    e.preventDefault()
    e.stopPropagation()
    const zone = defilement.current!
    const valeur = cellule?.etat === 'ok' ? cellule.valeur : undefined
    let jusqua = index
    let pointeur = { x: e.clientX, y: e.clientY }
    setRecopie({ cle, depuis: index, jusqua })
    const suivre = () => {
      const sous = document.elementFromPoint(pointeur.x, pointeur.y)?.closest<HTMLElement>('[data-index]')
      const i = sous ? Number(sous.dataset.index) : NaN
      if (Number.isInteger(i) && i !== jusqua) {
        jusqua = i
        setRecopie({ cle, depuis: index, jusqua })
      }
    }
    // Au bord de la zone, le tableau défile tant que le pointeur y reste.
    const minuterie = setInterval(() => {
      const r = zone.getBoundingClientRect()
      const pas = pointeur.y < r.top + BORD_DEFILEMENT ? -14 : pointeur.y > r.bottom - BORD_DEFILEMENT ? 14 : 0
      if (pas === 0) return
      zone.scrollTop += pas
      suivre()
    }, 30)
    const bouger = (ev: PointerEvent) => {
      pointeur = { x: ev.clientX, y: ev.clientY }
      suivre()
    }
    const lacher = () => {
      clearInterval(minuterie)
      document.removeEventListener('pointermove', bouger)
      document.removeEventListener('pointerup', lacher)
      document.body.classList.remove('recopie-en-cours')
      setRecopie(null)
      const [a, b] = [Math.min(index, jusqua), Math.max(index, jusqua)]
      const cibles = elements.slice(a, b + 1).flatMap((x) => (x.type === 'ligne' && x.lv.ligne.chemin !== ligne.chemin ? [x.lv.ligne] : []))
      if (cibles.length === 0) return
      for (const l of cibles) retenir(l.id)
      void lancer(espace.modifierLignes(base, [...new Set(cibles.map((l) => l.chemin))], cle, valeur))
    }
    document.body.classList.add('recopie-en-cours')
    document.addEventListener('pointermove', bouger)
    document.addEventListener('pointerup', lacher)
  }
  const recopiable = (c: Colonne) => c.cle !== depot.schema.champTitre && (estSaisie(c) || c.type === 'relation')

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
    <div className={`tableau ${retourLigne ? 'retour-ligne' : ''} ${selectionnable ? 'selectionnable' : ''}`} ref={defilement}>
      <div style={{ width: table.getTotalSize() + 80 + (selectionnable ? LARGEUR_GOUTTIERE : 0) }}>
        <div className="entete">
          {selectionnable && (
            <div className="gouttiere">
              <input
                type="checkbox"
                aria-label="Sélectionner toutes les lignes"
                checked={lignes.length > 0 && choisies.length === lignes.length}
                ref={(el) => {
                  if (el) el.indeterminate = choisies.length > 0 && choisies.length < lignes.length
                }}
                onChange={toutCocher}
              />
            </div>
          )}
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
                  <Icone de={ICONES[c.type]} />
                  {c.nom}
                  {tri && <Icone de={tri.sens === 'asc' ? ArrowUp : ArrowDown} className="indicateur-tri" taille={13} />}
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
                  <Icone de={e.replie ? ChevronRight : ChevronDown} className="triangle" />
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
                    <Icone de={Plus} /> Nouvelle ligne
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
                className={`rangee ${e.lv.sortira ? 'sortira' : ''} ${enDouble?.has(ligne.id) ? 'conflit' : ''} ${selection.has(ligne.chemin) ? 'choisie' : ''}`}
                title={
                  enDouble?.has(ligne.id)
                    ? 'Identifiant porté par plusieurs fichiers : voir le bandeau au-dessus'
                    : e.lv.sortira
                      ? 'Sortira de la vue au prochain rafraîchissement'
                      : undefined
                }
              >
                {selectionnable && (
                  <div className="gouttiere">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${titreDe(etat, base, ligne.id) ?? 'la ligne'}`}
                      checked={selection.has(ligne.chemin)}
                      onChange={() => undefined}
                      onClick={(ev) => cocher(ligne.chemin, ev.shiftKey)}
                    />
                  </div>
                )}
                {tailles.map(({ colonne, largeur }) => (
                  <div
                    key={colonne.cle}
                    className={`case ${recopie?.cle === colonne.cle && plageRecopie?.has(ligne.chemin) ? 'recopie' : ''}`}
                    style={{ width: largeur }}
                  >
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
                      lot={lot(ligne)}
                    />
                    {recopiable(colonne) && (
                      <span
                        className="poignee-recopie"
                        title="Tirer vers le haut ou le bas pour recopier cette valeur"
                        onPointerDown={(ev) => commencerRecopie(ev, v.index, ligne, colonne.cle)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {!colonneGroupe && (
          <button className="nouvelle-ligne" onClick={() => void nouvelleLigne()}>
            <Icone de={Plus} /> Nouvelle ligne
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
      {choisies.length > 0 && (
        <BarreSelection
          espace={espace}
          base={base}
          choisies={choisies}
          confirmer={confirmer}
          setConfirmer={setConfirmer}
          copier={() => {
            const g = grilleChoisies()
            const html = new Blob([versHtml(g)], { type: 'text/html' })
            const texte = new Blob([versMarkdown(g)], { type: 'text/plain' })
            return navigator.clipboard.write([new ClipboardItem({ 'text/html': html, 'text/plain': texte })])
          }}
          dupliquer={async () => {
            const copies = await lancer(espace.dupliquerLignes(base, choisies.map((l) => l.chemin)))
            if (!copies) return
            for (const c of copies) retenir(c.id)
            setSelection(new Set(copies.map((c) => c.chemin)))
          }}
          supprimer={async (nettoyer) => {
            const chemins = choisies.map((l) => l.chemin)
            setSelection(new Set())
            await lancer(espace.supprimerLignes(base, chemins, nettoyer))
          }}
          vider={() => setSelection(new Set())}
        />
      )}
      {collage && (
        <FenetreImport
          espace={espace}
          base={base}
          colle={collage}
          fermer={() => setCollage(null)}
        />
      )}
    </div>
  )
}

/** Barre des lignes sélectionnées : copier, dupliquer, supprimer (avec les liens vers elles, spec §5). */
function BarreSelection(p: {
  espace: DepotEspace
  base: string
  choisies: LigneChargee[]
  confirmer: boolean
  setConfirmer: (v: boolean) => void
  copier: () => Promise<void>
  dupliquer: () => Promise<void>
  supprimer: (nettoyer: boolean) => Promise<void>
  vider: () => void
}) {
  const lancer = useLancer()
  const bouton = useRef<HTMLButtonElement>(null)
  const [nettoyer, setNettoyer] = useState(true)
  const [copie, setCopie] = useState(false)
  const n = p.choisies.length
  const pluriel = n > 1 ? 's' : ''
  const liens = p.confirmer ? [...new Set(p.choisies.map((l) => l.id))].reduce((t, id) => t + p.espace.liensVers(p.base, id).length, 0) : 0

  return (
    <div className="barre-selection" role="toolbar" aria-label="Lignes sélectionnées">
      <span className="compte-selection">
        {n} ligne{pluriel} sélectionnée{pluriel}
      </span>
      {n > 1 && <span className="discret astuce-selection">Une cellule modifiée l’est sur toutes</span>}
      <button
        className="discret"
        onClick={() =>
          void lancer(p.copier()).then(() => {
            setCopie(true)
            setTimeout(() => setCopie(false), 1200)
          })
        }
      >
        <Icone de={Copy} /> {copie ? 'Copié' : 'Copier'}
      </button>
      <button className="discret" onClick={() => void p.dupliquer()}>
        <Icone de={CopyPlus} /> Dupliquer
      </button>
      <button ref={bouton} className="discret danger-texte" onClick={() => p.setConfirmer(true)}>
        <Icone de={Trash2} /> Supprimer
      </button>
      <button className="discret" onClick={p.vider} aria-label="Désélectionner">
        <Icone de={X} />
      </button>
      {p.confirmer && (
        <Flottant ancre={bouton.current} fermer={() => p.setConfirmer(false)}>
          <div className="confirmation">
            <p>
              Supprimer {n > 1 ? `ces ${n} lignes` : 'cette ligne'} ? {n > 1 ? 'Leurs fichiers sont effacés' : 'Son fichier est effacé'} du dossier <code>{p.base}</code>.
            </p>
            {liens > 0 && (
              <label className="case-a-cocher">
                <input type="checkbox" checked={nettoyer} onChange={(e) => setNettoyer(e.target.checked)} />
                {liens === 1 ? 'Retirer aussi le lien qui pointe vers elles' : `Retirer aussi les ${liens} liens qui pointent vers elles`}
                <span className="discret"> (sinon ils restent, signalés comme cassés)</span>
              </label>
            )}
            <div className="boutons">
              <button onClick={() => p.setConfirmer(false)}>Annuler</button>
              <button
                className="danger"
                autoFocus
                onClick={() => {
                  p.setConfirmer(false)
                  void p.supprimer(nettoyer)
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </Flottant>
      )}
    </div>
  )
}
