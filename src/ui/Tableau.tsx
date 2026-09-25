import {
  columnResizingFeature,
  columnSizingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EvenementPointeur } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace, Remplacement } from '../core/depot-espace'
import { grilleDeVue, lireCsv, lireMarkdown, lireTableauColle, versHtml, versMarkdown, versTsv, type Grille, type Libelle } from '../core/echange'
import type { LigneVue } from '../core/filtres'
import { colonnesDeLaVue, grouper, type Groupe } from '../core/groupes'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDuSchema, estSaisie, type Calcul, type Colonne } from '../core/schema'
import type { Valeur } from '../core/valeurs'
import type { ModificationVue, Tri, Vue } from '../core/vue'
import { useLancer } from './actions'
import { BarreSelection, FenetreRemplacement } from './ActionsTableau'
import { estChampDeSaisie } from './clavier'
import { Cellule, champRemonte, Pastille } from './cellules'
import { titreDe, useEspace } from './contexte-espace'
import { AjoutColonne, MenuColonne } from './EnteteColonne'
import { FenetreImport } from './Echange'
import { Icone, ICONES } from './icones'
import { PiedTableau } from './PiedTableau'
import { useConsultation } from './mode'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus } from 'lucide-react'

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

/** Une case du tableau : rang de la ligne dans l'ordre affiché, rang de la colonne visible. */
type Case = { l: number; c: number }

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
  // Consultation : rien ne se modifie, ni cellules, ni colonnes, ni lignes.
  const lecture = useConsultation()
  // Sélection de lignes (vue principale seulement) : cases dans la gouttière, barre d'actions.
  const selectionnable = !!reglages && !lecture
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
        ...(lecture ? [] : [{ type: 'ajout', groupe: g } as Element]),
        ...(aDesCalculs ? [{ type: 'pied', groupe: g } as Element] : []),
      ]
    })
  }, [lignesVue, colonneGroupe, replies, aDesCalculs, etat, lecture])

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

  // Plage de cellules tracée à la souris (ou Maj+clic) : copier, coller en remplaçant, Suppr pour vider.
  const [plage, setPlage] = useState<{ a: Case; b: Case } | null>(null)
  const ancreCase = useRef<Case | null>(null)
  const [remplacement, setRemplacement] = useState<{ r: Remplacement; depart: string; tableau: string[][] } | null>(null)
  const rangs = useMemo(() => new Map(ordreAffiche.map((c, i) => [c, i])), [ordreAffiche])
  const parChemin = useMemo(() => new Map(lignes.map((l) => [l.chemin, l])), [lignes])
  const bornes = plage && {
    l1: Math.min(plage.a.l, plage.b.l),
    l2: Math.max(plage.a.l, plage.b.l),
    c1: Math.min(plage.a.c, plage.b.c),
    c2: Math.max(plage.a.c, plage.b.c),
  }
  /** Ombres qui dessinent le bord de la plage sur une case ; `undefined` hors plage. */
  const bordPlage = (chemin: string, c: number): string | undefined => {
    const l = rangs.get(chemin)
    if (!bornes || l === undefined || l < bornes.l1 || l > bornes.l2 || c < bornes.c1 || c > bornes.c2) return undefined
    // Case copiée : le pointillé tient lieu de bord, un trait plein le cacherait.
    if (copie?.chemins.has(chemin) && c >= copie.c1 && c <= copie.c2) return 'inset 0 0 0 1000px var(--accent-fond)'
    const bords = ['inset 0 0 0 1000px var(--accent-fond)']
    if (l === bornes.l1) bords.unshift('inset 0 2px 0 var(--accent)')
    if (l === bornes.l2) bords.unshift('inset 0 -2px 0 var(--accent)')
    if (c === bornes.c1) bords.unshift('inset 2px 0 0 var(--accent)')
    if (c === bornes.c2) bords.unshift('inset -2px 0 0 var(--accent)')
    return bords.join(', ')
  }

  // Cases copiées : bord en pointillé qui défile, comme dans un tableur, jusqu'à Échap ou la prochaine action.
  const [copie, setCopie] = useState<{ chemins: ReadonlySet<string>; c1: number; c2: number } | null>(null)
  /** Classe et bords du pointillé d'une case copiée ; `undefined` hors copie. */
  const bordCopie = (chemin: string, c: number) => {
    const l = rangs.get(chemin)
    if (!copie || l === undefined || !copie.chemins.has(chemin) || c < copie.c1 || c > copie.c2) return undefined
    const bord = (oui: boolean) => (oui ? 'var(--accent)' : 'transparent')
    return {
      '--copie-haut': bord(!copie.chemins.has(ordreAffiche[l - 1] ?? '')),
      '--copie-bas': bord(!copie.chemins.has(ordreAffiche[l + 1] ?? '')),
      '--copie-gauche': bord(c === copie.c1),
      '--copie-droite': bord(c === copie.c2),
    } as CSSProperties
  }

  // Après un collage, une recopie, une action en lot ou un Ctrl+Z : les cases touchées brillent un instant.
  const [eclair, setEclair] = useState<{ cles: ReadonlySet<string>; lignes: ReadonlySet<string>; n: number } | null>(null)
  useEffect(
    () =>
      espace.ecouterEtapes((changements) => {
        setCopie(null)
        const cles = new Set<string>()
        const touchees = new Set<string>()
        for (const c of changements) {
          if (c.base !== base) continue
          if (c.type === 'cellule') cles.add(`${c.id}\u0000${c.cle}`)
          else touchees.add(c.id)
        }
        if (cles.size + touchees.size > 0) setEclair((e) => ({ cles, lignes: touchees, n: (e?.n ?? 0) + 1 }))
      }),
    [espace, base],
  )
  useEffect(() => {
    if (!eclair) return
    const t = setTimeout(() => setEclair(null), 1000)
    return () => clearTimeout(t)
  }, [eclair])
  // Deux noms d'animation en alternance : un éclair qui suit un autre repart du début.
  const classeEclair = eclair ? (eclair.n % 2 ? 'eclair-a' : 'eclair-b') : ''
  const eclaireCase = (id: string, cle: string) => !!eclair && (eclair.lignes.has(id) || eclair.cles.has(`${id}\u0000${cle}`))

  /** Le clic qui suit un glisser ne doit pas ouvrir l'éditeur de la case où il finit. */
  const bloquerClic = () => {
    const stop = (ev: MouseEvent) => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    document.addEventListener('click', stop, true)
    setTimeout(() => document.removeEventListener('click', stop, true), 0)
  }

  function appuiCase(e: EvenementPointeur, chemin: string, c: number) {
    if (!selectionnable || e.button !== 0) return
    if ((e.target as HTMLElement).closest('input, textarea, select, a, button, .poignee-recopie')) return
    const l = rangs.get(chemin)
    if (l === undefined) return
    const ici = { l, c }
    if (e.shiftKey && ancreCase.current) {
      setPlage({ a: ancreCase.current, b: ici })
      bloquerClic()
      return
    }
    ancreCase.current = ici
    setPlage(null)
    let glisse = false
    const bouger = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.case[data-l]')
      if (!el) return
      const fin = { l: Number(el.dataset.l), c: Number(el.dataset.c) }
      if (!glisse && fin.l === l && fin.c === c) return
      if (!glisse) {
        glisse = true
        document.body.classList.add('plage-en-cours')
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        document.getSelection()?.removeAllRanges()
      }
      setPlage({ a: ici, b: fin })
    }
    const lacher = () => {
      document.removeEventListener('pointermove', bouger)
      document.removeEventListener('pointerup', lacher)
      document.body.classList.remove('plage-en-cours')
      if (glisse) bloquerClic()
    }
    document.addEventListener('pointermove', bouger)
    document.addEventListener('pointerup', lacher)
  }

  /** Prépare un collage qui remplace, à partir de la case (l, c), sur une zone hauteur × largeur. */
  const demanderRemplacement = (l: number, c: number, hauteur: number, largeur: number, grille: string[][], tableau: string[][]) => {
    const r = espace.preparerRemplacement(base, { lignes: ordreAffiche.slice(l), colonnes: visibles.slice(c).map((x) => x.cle), hauteur, largeur }, grille)
    const ligne = parChemin.get(ordreAffiche[l] ?? '')
    const titre = ligne ? (titreDe(etat, base, ligne.id) ?? 'Sans titre') : ''
    setRemplacement({ r, depart: `${titre} › ${visibles[c]?.nom ?? ''}`, tableau })
  }
  const appliquerRemplacement = (r: Remplacement) => {
    for (const m of r.modifs) {
      const l = parChemin.get(m.chemin)
      if (l) retenir(l.id)
    }
    void lancer(espace.appliquerRemplacement(base, r))
  }

  // Clavier et presse-papiers, hors champ en cours de saisie : Échap, Suppr, copier, coller.
  useEffect(() => {
    if (!selectionnable) return
    // Fenêtre ou menu ouvert : Échap et les raccourcis leur reviennent.
    const ouvert = () => document.querySelector('.voile-fenetre, .flottant') !== null
    const occupe = (t: EventTarget | null) => estChampDeSaisie(t) || ouvert()
    const touche = (e: KeyboardEvent) => {
      if (occupe(e.target)) return
      if (e.key === 'Escape') setCopie(null)
      if (bornes) {
        if (e.key === 'Escape') setPlage(null)
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          const zone = { lignes: ordreAffiche.slice(bornes.l1), colonnes: visibles.slice(bornes.c1).map((c) => c.cle) }
          const hauteur = bornes.l2 - bornes.l1 + 1
          const largeur = bornes.c2 - bornes.c1 + 1
          appliquerRemplacement(espace.preparerRemplacement(base, { ...zone, hauteur, largeur }, Array.from({ length: hauteur }, () => Array<string>(largeur).fill(''))))
        }
        return
      }
      if (choisies.length === 0) return
      if (e.key === 'Escape') setSelection(new Set())
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        setConfirmer(true)
      }
    }
    const copier = (e: ClipboardEvent) => {
      if (occupe(e.target) || !(document.getSelection()?.isCollapsed ?? true)) return
      if (bornes) {
        e.preventDefault()
        const lignesPlage = ordreAffiche.slice(bornes.l1, bornes.l2 + 1).flatMap((ch) => parChemin.get(ch) ?? [])
        const g = grilleDeVue(lignesPlage, visibles.slice(bornes.c1, bornes.c2 + 1), libelle, true)
        e.clipboardData?.setData('text/plain', versTsv(g.lignes))
        e.clipboardData?.setData('text/html', versHtml(g, false))
        setCopie({ chemins: new Set(lignesPlage.map((l) => l.chemin)), c1: bornes.c1, c2: bornes.c2 })
        return
      }
      if (choisies.length === 0) return
      e.preventDefault()
      const g = grilleChoisies()
      e.clipboardData?.setData('text/plain', versMarkdown(g))
      e.clipboardData?.setData('text/html', versHtml(g))
      setCopie({ chemins: new Set(choisies.map((l) => l.chemin)), c1: 0, c2: visibles.length - 1 })
    }
    const coller = (e: ClipboardEvent) => {
      if (ouvert()) return
      const texte = e.clipboardData?.getData('text/plain') ?? ''
      const tableau = lireTableauColle(texte)
      // Pour remplacer, les en-têtes d'un tableau Markdown ne sont pas des valeurs.
      const md = lireMarkdown(texte)
      const grille = md ? md.slice(1) : lireCsv(texte)
      const plusieurs = grille.length > 1 || (grille[0]?.length ?? 0) > 1
      // Dans une cellule en édition : une valeur seule va dans le champ, un tableau part de cette cellule.
      if (estChampDeSaisie(e.target)) {
        const cas = (e.target as HTMLElement).closest<HTMLElement>('.case[data-l]')
        if (!cas || !plusieurs || !defilement.current?.contains(cas)) return
        e.preventDefault()
        demanderRemplacement(Number(cas.dataset.l), Number(cas.dataset.c), 1, 1, grille, tableau)
        return
      }
      if (bornes) {
        e.preventDefault()
        if (grille.length === 0) return
        demanderRemplacement(bornes.l1, bornes.c1, bornes.l2 - bornes.l1 + 1, bornes.c2 - bornes.c1 + 1, grille, tableau)
        return
      }
      // Sans cellule choisie, un tableau collé devient des lignes nouvelles ; une valeur seule, rien.
      if (tableau.length < 2 && (tableau[0]?.length ?? 0) < 2) return
      e.preventDefault()
      const prepare = espace.preparerCollage(base, tableau, visibles.map((c) => c.cle))
      if (prepare.lignes.length > 0) setCollage(prepare)
    }
    // Un appui hors des cases (et hors des fenêtres qu'elles ouvrent) efface la plage.
    const ailleurs = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest('.case[data-l], .voile-fenetre, .flottant')) return
      setPlage(null)
    }
    document.addEventListener('keydown', touche)
    document.addEventListener('copy', copier)
    document.addEventListener('paste', coller)
    document.addEventListener('pointerdown', ailleurs)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('copy', copier)
      document.removeEventListener('paste', coller)
      document.removeEventListener('pointerdown', ailleurs)
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
                  if (!reglages || lecture) return
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
                  draggable={!!reglages && !lecture}
                  onDragStart={(e) => e.dataTransfer.setData('text/colonne', c.cle)}
                  onClick={(e) => !lecture && setMenu({ cle: c.cle, ancre: e.currentTarget.parentElement! })}
                >
                  <Icone de={ICONES[c.type]} />
                  {c.nom}
                  {tri && <Icone de={tri.sens === 'asc' ? ArrowUp : ArrowDown} className="indicateur-tri" taille={13} />}
                </span>
                {!lecture && (
                  <div
                    className={`poignee ${h.column.getIsResizing() ? 'active' : ''}`}
                    onMouseDown={h.getResizeHandler()}
                    onDoubleClick={() => h.column.resetSize()}
                  />
                )}
              </div>
            )
          })}
          {!lecture && <AjoutColonne espace={espace} base={base} />}
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
                {tailles.map(({ colonne, largeur }, ci) => (
                  <div
                    key={colonne.cle}
                    className={`case ${recopie?.cle === colonne.cle && plageRecopie?.has(ligne.chemin) ? 'recopie' : ''} ${bordCopie(ligne.chemin, ci) ? 'copiee' : ''} ${eclaireCase(ligne.id, colonne.cle) ? classeEclair : ''}`}
                    style={{ width: largeur, boxShadow: bordPlage(ligne.chemin, ci), ...bordCopie(ligne.chemin, ci) }}
                    data-l={selectionnable ? rangs.get(ligne.chemin) : undefined}
                    data-c={ci}
                    onPointerDown={(ev) => appuiCase(ev, ligne.chemin, ci)}
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
                    {!lecture && recopiable(colonne) && (
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

        {!colonneGroupe && !lecture && (
          <button className="nouvelle-ligne" onClick={() => void nouvelleLigne()}>
            <Icone de={Plus} /> Nouvelle ligne
          </button>
        )}
        {reglages && !(lecture && !aDesCalculs) && (
          <PiedTableau
            colonnes={tailles}
            lignes={lignes}
            calculs={calculs}
            changer={lecture ? undefined : (cle, calcul?: Calcul) => {
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
      {remplacement && (
        <FenetreRemplacement
          remplacement={remplacement.r}
          depart={remplacement.depart}
          appliquer={() => {
            appliquerRemplacement(remplacement.r)
            setRemplacement(null)
          }}
          enNouvellesLignes={() => {
            const prepare = espace.preparerCollage(base, remplacement.tableau, visibles.map((c) => c.cle))
            setRemplacement(null)
            if (prepare.lignes.length > 0) setCollage(prepare)
          }}
          fermer={() => setRemplacement(null)}
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
