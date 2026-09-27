import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as PointerReact, type ReactNode } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDe, estSaisie, type Colonne, type Schema } from '../core/schema'
import { enfantsDe, type Noeud, type SourceArbre } from '../core/arbre-temps'
import { CLE_VIDE, groupables, grouper, type Groupe } from '../core/groupes'
import {
  ajouterMois,
  apresGeste,
  debutMois,
  decaler,
  ecartJours,
  empiler,
  enveloppe,
  etendue,
  graduations,
  jourDe,
  plageApresGeste,
  plageDe,
  type Echelle,
  type Geste,
  type Plage,
} from '../core/temps'
import type { ModificationVue, Niveau, Vue } from '../core/vue'
import { useLancer } from './actions'
import { ValeurCompacte } from './cellules'
import { dateCourte, Echelles, plageEnTexte, titreLigne } from './Calendrier'
import { titreDe, useEspace } from './contexte-espace'
import { glisser, usePose } from './glisser'
import { useAujourdhui } from './useAujourdhui'
import { ChevronRight, Plus } from 'lucide-react'
import { Icone } from './icones'
import { useConsultation } from './mode'
import { couleurDeLigne, type ReglageCouleur } from '../core/couleurs'
import { styleCouleur } from './couleurs'
import { estChampDeSaisie } from './clavier'
import { flottantOuvert } from './flottant'

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
  /** Ouvre la page d'une ligne d'une autre base (niveaux dépliés). */
  ouvrirPage: (base: string, id: string) => void
}

/** Largeur d'un jour selon le zoom, en pixels. */
const PIXELS_PAR_JOUR: Record<Echelle, number> = { semaine: 36, mois: 12, trimestre: 4 }
/** Bornes du zoom libre, en pixels par jour. */
const ZOOM_MIN = 1
const ZOOM_MAX = 90
/** Graduations lisibles à ce zoom : les jours au-delà de 24 px, les semaines au-delà de 7, sinon les mois. */
const echelleDe = (px: number): Echelle => (px >= 24 ? 'semaine' : px >= 7 ? 'mois' : 'trimestre')

/** Zoom libre d'une timeline (pixels par jour), gardé dans le navigateur comme les replis ; null : celui de l'échelle. */
function useZoom(cle: string): [number | null, (px: number | null) => void] {
  const [zoom, setZoom] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem(cle))
      return n >= ZOOM_MIN && n <= ZOOM_MAX ? n : null
    } catch {
      return null
    }
  })
  const changer = (px: number | null) => {
    setZoom(px)
    try {
      if (px === null) localStorage.removeItem(cle)
      else localStorage.setItem(cle, String(px))
    } catch {
      // Stockage indisponible (navigation privée) : le zoom vaut pour la session.
    }
  }
  return [zoom, changer]
}
const HAUTEUR_LIGNE = 36
/** Décalage d'une sous-ligne à l'autre dans une rangée qui porte un niveau « sur la ligne ». */
const PAS_SOUS_LIGNE = 28
/** Hauteur d'une rangée de titres de bandes (en-tête ou pied). */
const HAUTEUR_BANDE = 20
const LARGEUR_TITRES = 240

let pinceau: { contexte: CanvasRenderingContext2D | null; police: string } | undefined
/** Largeur à l'écran d'un titre de bande (police de `.tl-titre-bande`), marges et écart compris. */
function largeurTitreBande(titre: string): number {
  pinceau ??= { contexte: document.createElement('canvas').getContext('2d'), police: `${0.75 * parseFloat(getComputedStyle(document.body).fontSize)}px ${getComputedStyle(document.body).fontFamily}` }
  if (!pinceau.contexte) return titre.length * 7 + 20
  pinceau.contexte.font = pinceau.police
  return pinceau.contexte.measureText(titre).width + 12 + 8
}
/** Retrait d'un niveau déplié dans la colonne des titres. */
const RETRAIT = 18

/** Geste en cours : la barre suit le pointeur au pixel (`dx`), le cadre d'arrivée montre le jour où elle s'accrochera. */
type EnCours = { chemin: string; geste: Geste; jours: number; dx: number }

/** Ce qui place une ligne dans le temps : sa base et les colonnes de dates de son niveau. */
type Axe = {
  base: string
  depot: DepotBase
  schema: Schema
  debut?: Colonne
  fin?: Colonne
  jalons: Colonne[]
  /** Niveau déplié sans fin : des losanges. */
  point: boolean
  couleur: ReglageCouleur
  /** Champs affichés sur les barres (`champs_carte` de la vue ou du niveau). */
  champs: Colonne[]
  /** Titre écrit sur les barres (sinon seulement dans l'infobulle), `sans_titre`. */
  titre: boolean
}
type Rangee = { ligne: LigneChargee; sortira: boolean; axe: Axe; plage: Plage | null; jalons: { colonne: Colonne; jour: string }[]; /** Couleur nommée de la barre, ou neutre. */ couleur: string | undefined }
/** Rangées affichées : en-têtes de groupe (repliables), lignes (et leurs niveaux dépliés), et la rangée « + Nouvelle ». */
type Element =
  | { type: 'groupe'; groupe: Groupe; plage: Plage | null; replie: boolean }
  | {
      type: 'ligne'
      rangee: Rangee
      groupe?: string
      /** Chemin depuis la ligne de premier niveau (clé de repli). */
      cle: string
      profondeur: number
      /** Nombre d'enfants dépliables ; 0 : pas de triangle. */
      enfants: number
      replie: boolean
      /** Barre calculée qui couvre les descendants, pour une ligne sans dates à elle. */
      enveloppe: Plage | null
      /** Nom de la base, quand plusieurs relations sont dépliées au même niveau. */
      etiquette?: string
      /** Lignes des niveaux « sur la ligne », dessinées sur cette rangée, et leur sous-ligne. */
      surLaLigne: { rangee: Rangee; sousLigne: number }[]
      /** Nombre de sous-lignes (1 au moins) : la hauteur de la rangée. */
      sousLignes: number
    }
  | { type: 'ajout' }

function axeDe(
  depot: DepotBase,
  base: string,
  couleur: ReglageCouleur,
  debut?: string,
  fin?: string,
  jalons: readonly string[] = [],
  niveau = false,
  champs: readonly string[] = [],
  titre = true,
): Axe {
  const schema = depot.schema
  const colFin = fin ? colonneDe(schema, fin) : undefined
  return {
    base,
    depot,
    schema,
    debut: debut ? colonneDe(schema, debut) : undefined,
    fin: colFin,
    jalons: jalons.flatMap((c) => colonneDe(schema, c) ?? []),
    point: niveau && !colFin,
    couleur,
    champs: champs.flatMap((c) => colonneDe(schema, c) ?? []),
    titre,
  }
}

function rangeeDe(ligne: LigneChargee, sortira: boolean, axe: Axe): Rangee {
  return {
    ligne,
    sortira,
    axe,
    plage: axe.debut ? plageDe(ligne, axe.debut, axe.fin) : null,
    jalons: axe.jalons.flatMap((c) => {
      const cellule = ligne.cellules[c.cle]
      const jour = cellule?.etat === 'ok' ? jourDe(cellule.valeur) : null
      return jour ? [{ colonne: c, jour }] : []
    }),
    couleur: couleurDeLigne(ligne, axe.schema, axe.couleur),
  }
}

/** Hauteur d'une rangée : une rangée qui porte des lignes empilées grandit d'une sous-ligne à chaque étage. */
const hauteurDe = (el: Element | undefined) => (el?.type === 'ligne' ? HAUTEUR_LIGNE + (el.sousLignes - 1) * PAS_SOUS_LIGNE : HAUTEUR_LIGNE)

/** Plages et jalons d'une rangée, comme des plages : pour l'étendue et les barres calculées. */
const plagesDe = (r: Rangee): Plage[] => [...(r.plage ? [r.plage] : []), ...r.jalons.map((j) => ({ debut: j.jour, fin: j.jour }))]

/** Lignes repliées d'une timeline en arbre, gardées dans le navigateur (spec §7). */
function useReplis(cle: string): [ReadonlySet<string>, (c: string) => void] {
  const lire = (): ReadonlySet<string> => {
    try {
      const brut = localStorage.getItem(cle)
      return new Set(brut ? (JSON.parse(brut) as string[]) : [])
    } catch {
      return new Set()
    }
  }
  const [replis, setReplis] = useState(lire)
  const basculer = (c: string) => {
    const s = new Set(replis)
    if (s.has(c)) s.delete(c)
    else s.add(c)
    setReplis(s)
    try {
      localStorage.setItem(cle, JSON.stringify([...s]))
    } catch {
      // Stockage indisponible (navigation privée) : le repli vaut pour la session.
    }
  }
  return [replis, basculer]
}

/**
 * Timeline (spec §7) : une ligne par rangée, une barre du champ de début au
 * champ de fin, les jalons en losanges. Glisser la barre la déplace, ses bords
 * l'étirent. Une ligne sans date se place d'un clic sur sa rangée. Sous chaque
 * ligne, les relations cochées se déplient niveau par niveau.
 */
export function Timeline({ espace, base, depot, vue, modifierVue, lignesVue, valeursCreation, retenir, ouvrir, ouvrirPage }: Props) {
  const lecture = useConsultation()
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const [enCours, setEnCours] = useState<EnCours | null>(null)
  const [pose, poser] = usePose()
  // Groupes repliés : le temps de la session, comme au tableau.
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const [lignesRepliees, basculerLigne] = useReplis(`mdbase.timeline.${base}.${vue.id}`)
  const { etat } = useEspace()
  const defilement = useRef<HTMLDivElement>(null)
  const schema = depot.schema
  const echelle: Echelle = vue.echelle ?? 'mois'
  // Ctrl + molette, le pincement du trackpad ou + et - règlent un zoom libre ; les boutons d'échelle le remettent à zéro.
  const [zoom, setZoom] = useZoom(`mdbase.timeline.zoom.${base}.${vue.id}`)
  const px = zoom ?? PIXELS_PAR_JOUR[echelle]
  /** Jour (fractionnaire) à garder sous le même pixel de l'écran après un changement de zoom. */
  const ancre = useRef<{ jours: number; ecran: number } | null>(null)
  const clesJalons = (vue.champsJalons ?? []).join('|')
  const clesChamps = (vue.champsCarte ?? []).join('|')
  const axe = useMemo(
    () =>
      axeDe(
        depot,
        base,
        { couleur: vue.couleur, couleurPar: vue.couleurPar },
        vue.champDebut,
        vue.champFin,
        clesJalons ? clesJalons.split('|') : [],
        false,
        clesChamps ? clesChamps.split('|') : [],
        vue.sansTitre !== true,
      ),
    [depot, base, vue.champDebut, vue.champFin, clesJalons, clesChamps, vue.sansTitre, schema, vue.couleur, vue.couleurPar], // eslint-disable-line react-hooks/exhaustive-deps -- le schéma change sans que le dépôt change
  )
  const colDebut = axe.debut
  const colGroupe = vue.groupe ? groupables(schema).find((c) => c.cle === vue.groupe) : undefined

  const rangees = useMemo(() => lignesVue.map((lv) => rangeeDe(lv.ligne, lv.sortira, axe)), [lignesVue, axe])

  // Niveaux dépliés : les lignes liées, avec l'axe de leur niveau.
  const deplier = vue.deplier
  const arbres = useMemo(() => {
    const arbres = new Map<string, { noeud: Noeud; rangee: Rangee }[][]>()
    if (!deplier?.length) return arbres
    const bases = [...etat.bases.values()].filter((b) => b.depot)
    const src: SourceArbre = {
      schemas: new Map(bases.map((b) => [b.id, b.depot!.schema])),
      lignes: new Map(bases.map((b) => [b.id, b.depot!.lignes()])),
      calculs: etat.calculs,
    }
    const axes = new Map<Niveau, Axe | null>()
    const axeNiveau = (n: Noeud) => {
      if (!axes.has(n.niveau)) {
        const d = etat.bases.get(n.base)?.depot
        axes.set(n.niveau, d ? axeDe(d, n.base, n.niveau, n.niveau.champDebut, n.niveau.champFin, n.niveau.champsJalons, true, n.niveau.champsCarte, n.niveau.sansTitre !== true) : null)
      }
      return axes.get(n.niveau)!
    }
    const avecRangees = (noeuds: Noeud[]): { noeud: Noeud; rangee: Rangee }[] =>
      noeuds.flatMap((noeud) => {
        const a = axeNiveau(noeud)
        return a ? [{ noeud, rangee: rangeeDe(noeud.ligne, false, a) }] : []
      })
    for (const r of rangees) {
      const racine = `${base}:${r.ligne.id}`
      // Les nœuds par fratrie, la première étant celle des enfants directs.
      const parParent: { noeud: Noeud; rangee: Rangee }[][] = []
      const parcourir = (noeuds: Noeud[]) => {
        if (noeuds.length === 0) return
        parParent.push(avecRangees(noeuds))
        for (const n of noeuds) parcourir(n.enfants)
      }
      parcourir(enfantsDe(src, base, r.ligne, deplier, { aujourdhui }, racine))
      arbres.set(racine, parParent)
    }
    return arbres
  }, [deplier, etat, rangees, base, aujourdhui])
  /** Rangée de chaque nœud déplié, par clé. */
  const rangeesNoeuds = useMemo(() => new Map([...arbres.values()].flat(2).map((x) => [x.noeud.cle, x])), [arbres])

  // Bandes : les lignes d'autres bases (moratoires, sprints…) en travers de toute la timeline.
  const sourcesBandes = vue.bandes
  const listeBandes = useMemo(() => {
    return (sourcesBandes ?? []).flatMap((b) => {
      const d = etat.bases.get(b.base)?.depot
      const debut = d && b.champDebut ? colonneDe(d.schema, b.champDebut) : undefined
      if (!d || !debut) return []
      const fin = b.champFin ? colonneDe(d.schema, b.champFin) : undefined
      const calculs = etat.calculs.get(b.base)
      return d.lignes().flatMap((l0) => {
        const c = calculs?.get(l0.id)
        const l = c ? { ...l0, cellules: { ...l0.cellules, ...c } } : l0
        const plage = plageDe(l, debut, fin)
        return plage ? [{ base: b.base, ligne: l, plage, titre: titreLigne(l, d.schema.champTitre), couleur: couleurDeLigne(l, d.schema, b), bas: b.titres === 'bas' }] : []
      })
    })
  }, [sourcesBandes, etat])
  // Un titre plus long que sa bande déborde à droite : il compte pour sa longueur quand on range
  // les titres en étages, si bien que deux titres ne se chevauchent jamais, à tout zoom.
  const bandes = useMemo(() => {
    const finDuTitre = (b: (typeof listeBandes)[number]) => {
      const fin = decaler(b.plage.debut, Math.ceil(largeurTitreBande(b.titre) / px) - 1)
      return fin > b.plage.fin ? fin : b.plage.fin
    }
    const ranger = (bas: boolean) => {
      const liste = listeBandes.filter((b) => b.bas === bas)
      const etages = empiler(liste.map((b) => ({ debut: b.plage.debut, fin: finDuTitre(b) })))
      return { liste: liste.map((b, i) => ({ ...b, etage: etages[i]! })), etages: Math.max(0, ...etages.map((i) => i + 1)) }
    }
    return { toutes: listeBandes, haut: ranger(false), bas: ranger(true) }
  }, [listeBandes, px])

  // Largeur de la zone des barres à l'écran : la timeline la remplit toujours, jusqu'au bord droit.
  const [largeurVisible, setLargeurVisible] = useState(0)
  const affichee = colDebut !== undefined
  useLayoutEffect(() => {
    const el = defilement.current
    if (!el) return
    const mesurer = () => setLargeurVisible(el.clientWidth - LARGEUR_TITRES)
    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(el)
    return () => observateur.disconnect()
  }, [affichee])

  // Légende : les options de chaque colonne qui colore des barres (la vue, ses niveaux, ses bandes),
  // pour lire une barre trop courte pour son titre. Rien à régler : elle suit les réglages de couleur.
  const legende = useMemo(() => {
    const groupes = new Map<string, { titre: string; options: { libelle: string; couleur: string }[] }>()
    const ajouter = (sch: Schema | undefined, couleurPar: string | undefined) => {
      const c = sch && couleurPar ? colonneDe(sch, couleurPar) : undefined
      if (!sch || (c?.type !== 'select' && c?.type !== 'multiselect') || c.options.length === 0) return
      const cle = `${sch.id}/${c.cle}`
      if (!groupes.has(cle))
        groupes.set(cle, { titre: sch.id === base ? c.nom : `${c.nom} · ${sch.nom}`, options: c.options.map((o) => ({ libelle: o.label, couleur: o.couleur ?? 'gris' })) })
    }
    const schemaDe = (id: string) => etat.bases.get(id)?.depot?.schema
    ajouter(schema, vue.couleurPar)
    const niveaux = (sch: Schema | undefined, liste: readonly Niveau[]) => {
      for (const n of liste) {
        const rel = sch ? colonneDe(sch, n.relation) : undefined
        const cible = rel?.type === 'relation' ? schemaDe(rel.cible) : undefined
        ajouter(cible, n.couleurPar)
        niveaux(cible, n.deplier)
      }
    }
    niveaux(schema, deplier ?? [])
    for (const b of sourcesBandes ?? []) ajouter(schemaDe(b.base), b.couleurPar)
    return [...groupes.values()]
  }, [schema, base, vue.couleurPar, deplier, sourcesBandes, etat])

  const e = useMemo(() => {
    const brute = etendue([...rangees.flatMap(plagesDe), ...[...rangeesNoeuds.values()].flatMap((x) => plagesDe(x.rangee))], aujourdhui)
    // Trop courte pour l'écran : prolongée jusqu'à la fin du mois qui atteint le bord droit.
    const jours = Math.ceil(largeurVisible / px)
    if (ecartJours(brute.debut, brute.fin) + 1 >= jours) return brute
    return { debut: brute.debut, fin: decaler(ajouterMois(debutMois(decaler(brute.debut, jours - 1)), 1), -1) }
  }, [rangees, rangeesNoeuds, aujourdhui, largeurVisible, px])
  const { haut, bas } = useMemo(() => graduations(e, echelleDe(px)), [e, px])

  const elements = useMemo((): Element[] => {
    /** Plages de tous les descendants d'un nœud (ou d'une ligne de premier niveau). */
    const couvertes = (enfants: readonly Noeud[]): Plage[] =>
      enfants.flatMap((n) => [...plagesDe(rangeesNoeuds.get(n.cle)?.rangee ?? rangeeDe(n.ligne, false, axe)), ...couvertes(n.enfants)])
    const visibles = (n: Noeud) => n.enfants.filter((x) => rangeesNoeuds.has(x.cle))
    /** Enfants des niveaux « sur la ligne », empilés sur la rangée du parent ; ceux sans date n'ont pas de place. */
    const empiles = (enfants: readonly Noeud[]) => {
      const places = enfants.flatMap((n) => {
        const r = n.niveau.surLaLigne ? rangeesNoeuds.get(n.cle)?.rangee : undefined
        return r?.plage ? [{ rangee: r, plage: r.plage }] : []
      })
      const sous = empiler(places.map((p) => p.plage))
      return { surLaLigne: places.map((p, i) => ({ rangee: p.rangee, sousLigne: sous[i]! })), sousLignes: Math.max(1, ...sous.map((i) => i + 1)) }
    }
    const deroule = (noeuds: readonly Noeud[], groupe: string | undefined, freres: number): Element[] =>
      noeuds.flatMap((n): Element[] => {
        const x = rangeesNoeuds.get(n.cle)
        if (!x) return []
        const tous = visibles(n)
        const enfants = tous.filter((c) => !c.niveau.surLaLigne)
        const replie = lignesRepliees.has(n.cle)
        const el: Element = {
          type: 'ligne',
          rangee: x.rangee,
          groupe,
          cle: n.cle,
          profondeur: n.profondeur,
          enfants: enfants.length,
          replie,
          enveloppe: x.rangee.plage ? null : enveloppe(couvertes(n.enfants)),
          ...(freres > 1 && { etiquette: etat.bases.get(n.base)?.depot?.schema.nom }),
          ...empiles(tous),
        }
        return [el, ...(replie ? [] : deroule(enfants, groupe, n.niveau.deplier.length))]
      })
    const premierNiveau = (rangee: Rangee, groupe?: string): Element[] => {
      const cle = `${base}:${rangee.ligne.id}`
      const tous = (arbres.get(cle)?.[0] ?? []).map((x) => x.noeud)
      const enfants = tous.filter((c) => !c.niveau.surLaLigne)
      const replie = lignesRepliees.has(cle)
      const el: Element = {
        type: 'ligne',
        rangee,
        groupe,
        cle,
        profondeur: 0,
        enfants: enfants.length,
        replie,
        enveloppe: rangee.plage ? null : enveloppe(couvertes(tous)),
        ...empiles(tous),
      }
      return [el, ...(replie ? [] : deroule(enfants, groupe, deplier?.length ?? 0))]
    }
    const ajout: Element[] = lecture ? [] : [{ type: 'ajout' }]
    if (!colGroupe) return [...rangees.flatMap((r) => premierNiveau(r)), ...ajout]
    const parChemin = new Map(rangees.map((r) => [r.ligne.chemin, r]))
    const cible = colGroupe.type === 'relation' ? colGroupe.cible : null
    return [
      ...grouper(lignesVue, colGroupe, (id) => (cible ? titreDe(etat, cible, id) : null)).flatMap((g): Element[] => {
        const siennes = g.lignes.map((l) => parChemin.get(l.ligne.chemin)!)
        const replie = replies.has(g.cle)
        const entete: Element = { type: 'groupe', groupe: g, plage: enveloppe(siennes.map((r) => r.plage)), replie }
        return replie ? [entete] : [entete, ...siennes.flatMap((rangee) => premierNiveau(rangee, g.cle))]
      }),
      ...ajout,
    ]
  }, [rangees, lignesVue, colGroupe, replies, etat, arbres, rangeesNoeuds, lignesRepliees, base, axe, deplier, lecture])
  const largeur = (ecartJours(e.debut, e.fin) + 1) * px
  const x = (jour: string) => ecartJours(e.debut, jour) * px
  const enArbre = (deplier?.length ?? 0) > 0
  /** Partie d'une plage dans l'étendue de la timeline (les bandes ne l'élargissent pas) ; null si elle est dehors. */
  const visible = (p: Plage): Plage | null =>
    p.fin < e.debut || p.debut > e.fin ? null : { debut: p.debut < e.debut ? e.debut : p.debut, fin: p.fin > e.fin ? e.fin : p.fin }

  const virtuel = useVirtualizer({
    count: elements.length,
    getScrollElement: () => defilement.current,
    estimateSize: (i) => hauteurDe(elements[i]),
    overscan: 10,
  })
  // Les hauteurs changent avec les lignes empilées : le virtualiseur les recalcule.
  useLayoutEffect(() => virtuel.measure(), [elements, virtuel])

  // Aujourd'hui en vue à l'ouverture et à chaque changement de zoom.
  const allerA = (jour: string) => {
    const el = defilement.current
    if (el) el.scrollLeft = Math.max(0, x(jour) - (el.clientWidth - LARGEUR_TITRES) / 3)
  }
  useLayoutEffect(() => allerA(aujourdhui), [echelle]) // volontairement : seulement au zoom, pas à chaque nouvelle étendue

  /** Zoom libre autour d'un point de l'écran (le pointeur, ou le milieu) : la date qui s'y trouve y reste. */
  const zoomer = (facteur: number, ecran?: number) => {
    const el = defilement.current
    if (!el) return
    const suivant = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, px * facteur))
    if (suivant === px) return
    const point = ecran ?? (el.clientWidth - LARGEUR_TITRES) / 2
    ancre.current = { jours: (el.scrollLeft + point) / px, ecran: point }
    setZoom(suivant)
  }
  useLayoutEffect(() => {
    const el = defilement.current
    if (el && ancre.current) el.scrollLeft = Math.max(0, ancre.current.jours * px - ancre.current.ecran)
    ancre.current = null
  }, [px])
  const zoomerRef = useRef(zoomer)
  zoomerRef.current = zoomer
  // Ctrl (ou Cmd) + molette, et le pincement du trackpad (que le navigateur envoie ainsi) : zoom sous le pointeur.
  useEffect(() => {
    const el = defilement.current
    if (!el) return
    const molette = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return
      ev.preventDefault()
      const zone = el.getBoundingClientRect()
      zoomerRef.current(Math.exp(-ev.deltaY * 0.0025), Math.max(0, ev.clientX - zone.left - LARGEUR_TITRES))
    }
    el.addEventListener('wheel', molette, { passive: false })
    return () => el.removeEventListener('wheel', molette)
  }, [affichee])
  // + et - zooment, 0 revient à l'échelle choisie ; jamais dans une saisie, un menu ou une fenêtre, ni avec Ctrl (le zoom du navigateur).
  useEffect(() => {
    const clavier = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || estChampDeSaisie(ev.target) || flottantOuvert() || document.querySelector('.voile-fenetre')) return
      if (ev.key === '+' || ev.key === '=') zoomerRef.current(1.25)
      else if (ev.key === '-') zoomerRef.current(1 / 1.25)
      else if (ev.key === '0' && zoom !== null) {
        const el = defilement.current
        if (el) ancre.current = { jours: (el.scrollLeft + (el.clientWidth - LARGEUR_TITRES) / 2) / px, ecran: (el.clientWidth - LARGEUR_TITRES) / 2 }
        setZoom(null)
      } else return
      ev.preventDefault()
    }
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  })
  // L'étendue peut grandir vers la gauche : garder la même date sous les yeux.
  const debutPrecedent = useRef(e.debut)
  useEffect(() => {
    const el = defilement.current
    if (el && debutPrecedent.current !== e.debut) el.scrollLeft += ecartJours(e.debut, debutPrecedent.current) * px
    debutPrecedent.current = e.debut
  }, [e.debut, px])

  if (!colDebut) return <p className="discret">Choisis le champ de début de la timeline dans « Options ».</p>

  const premier = (r: Rangee) => r.axe === axe
  const ouvrirRangee = (r: Rangee) => (premier(r) ? ouvrir(r.ligne) : ouvrirPage(r.axe.base, r.ligne.id))

  const commencer = (ev: PointerReact, r: Rangee, geste: Geste) => {
    const { debut, fin, depot } = r.axe
    if (!debut) return
    let jours = 0
    glisser(ev, {
      bouger: (dx) => {
        jours = Math.round(dx / px)
        setEnCours({ chemin: r.ligne.chemin, geste, jours, dx })
      },
      finir: () => {
        setEnCours(null)
        poser(r.ligne.chemin)
        const modifs = apresGeste(r.ligne, geste, jours, debut, fin)
        if (Object.keys(modifs).length === 0) return
        if (premier(r)) retenir(r.ligne.id)
        for (const [cle, v] of Object.entries(modifs)) depot.modifier(r.ligne.chemin, cle, v)
      },
      cliquer: () => ouvrirRangee(r),
      annuler: () => setEnCours(null),
    })
  }

  /** Place une ligne sans date au jour cliqué sur sa rangée. */
  const placer = (ev: MouseEvent<HTMLDivElement>, r: Rangee) => {
    if (!r.axe.debut) return
    const rect = ev.currentTarget.getBoundingClientRect()
    const jour = decaler(e.debut, Math.floor((ev.clientX - rect.left) / px))
    if (premier(r)) retenir(r.ligne.id)
    r.axe.depot.modifier(r.ligne.chemin, r.axe.debut.cle, jour)
  }

  /** Champs affichés d'une rangée, en valeurs compactes ; rien quand aucun n'a de valeur à montrer. */
  const afficher = (r: Rangee, cols: Colonne[]) =>
    cols.length === 0
      ? null
      : cols.map((c) => (
          <span key={c.cle} className="champ-carte">
            <ValeurCompacte base={r.axe.base} ligne={r.ligne} colonne={c} />
          </span>
        ))
  /** Champs de la vue ou du niveau : le début se lit avant la barre, la fin après, les autres après le titre. */
  const champsDe = (r: Rangee) => {
    const { champs, debut, fin } = r.axe
    return {
      avant: afficher(r, champs.filter((c) => c.cle === debut?.cle)),
      champs: afficher(r, champs.filter((c) => c.cle !== debut?.cle && c.cle !== fin?.cle)),
      apres: afficher(r, champs.filter((c) => c.cle === fin?.cle)),
    }
  }

  /** Titres des bandes, en étages : dans l'en-tête, ou sous la dernière rangée (`titres: bas`). */
  const titresBandes = (r: { liste: { base: string; ligne: LigneChargee; plage: Plage; titre: string; couleur: string | undefined; etage: number }[]; etages: number }) => (
    <div className="tl-titres-bandes" style={{ width: largeur, height: r.etages * HAUTEUR_BANDE + 4 }}>
      {r.liste.map((b) => {
        const p = visible(b.plage)
        return (
          p && (
            <button
              key={`${b.base}/${b.ligne.id}`}
              className="tl-titre-bande"
              style={{ left: x(p.debut), width: (ecartJours(p.debut, p.fin) + 1) * px, top: 2 + b.etage * HAUTEUR_BANDE, ...styleCouleur(b.couleur) }}
              title={`${b.titre} · ${plageEnTexte(b.plage)}`}
              onClick={() => ouvrirPage(b.base, b.ligne.id)}
            >
              {b.titre}
            </button>
          )
        )
      })}
    </div>
  )

  const basculer = (cle: string) => {
    const s = new Set(replies)
    if (s.has(cle)) s.delete(cle)
    else s.add(cle)
    setReplies(s)
  }

  const creer = async (groupe?: Groupe) => {
    const valeurs = { ...valeursCreation() }
    if (colGroupe && groupe?.valeur !== undefined) valeurs[colGroupe.cle] = groupe.valeur
    const ligne = await lancer(espace.creerLigne(base, valeurs))
    if (!ligne) return
    retenir(ligne.id)
    ouvrir(ligne)
  }

  return (
    <div className="timeline-vue">
      <div className="barre-temps">
        <span className="espaceur" />
        {zoom !== null && <span className="discret zoom-libre">Zoom libre</span>}
        <Echelles
          valeurs={['semaine', 'mois', 'trimestre']}
          active={zoom === null ? echelle : undefined}
          changer={(v) => {
            if (zoom !== null) {
              // Même échelle : aujourd'hui revient en vue, comme à un changement d'échelle.
              const el = defilement.current
              if (el && v === echelle) ancre.current = { jours: ecartJours(e.debut, aujourdhui), ecran: (el.clientWidth - LARGEUR_TITRES) / 3 }
              setZoom(null)
            }
            if (v !== echelle) modifierVue({ echelle: v })
          }}
        />
        <button className="discret" onClick={() => allerA(aujourdhui)}>
          Aujourd'hui
        </button>
      </div>
      <div className="timeline" ref={defilement}>
        <div style={{ width: LARGEUR_TITRES + largeur }}>
          <div className="tl-entete" style={bandes.haut.etages > 0 ? { height: 52 + bandes.haut.etages * HAUTEUR_BANDE + 4 } : undefined}>
            <div className="tl-coin">{colDebut.nom}</div>
            <div className="tl-graduations" style={{ width: largeur }}>
              <Rangee graduations={haut} x={x} px={px} classe="tl-haut" />
              <Rangee graduations={bas} x={x} px={px} classe="tl-bas" />
              {bandes.haut.etages > 0 && titresBandes(bandes.haut)}
            </div>
          </div>
          <div className="tl-corps" style={{ height: virtuel.getTotalSize() }}>
            <div className="tl-fond" style={{ left: LARGEUR_TITRES, width: largeur }}>
              {bandes.toutes.map((b) => {
                const p = visible(b.plage)
                return (
                  p && (
                    <div
                      key={`${b.base}/${b.ligne.id}`}
                      className="tl-bande"
                      style={{ left: x(p.debut), width: (ecartJours(p.debut, p.fin) + 1) * px, ...styleCouleur(b.couleur) }}
                    />
                  )
                )
              })}
              {bas.map((g) => (
                <div key={g.debut} className="tl-trait" style={{ left: x(g.debut) }} />
              ))}
              {aujourdhui >= e.debut && aujourdhui <= e.fin && (
                <div className="tl-aujourdhui" style={{ left: x(aujourdhui) + px / 2 }} title="Aujourd'hui" />
              )}
            </div>
            {virtuel.getVirtualItems().map((v) => {
              const el = elements[v.index]!
              if (el.type === 'groupe') {
                const g = el.groupe
                return (
                  <div key={`groupe/${g.cle}`} className="tl-ligne tl-groupe" style={{ transform: `translateY(${v.start}px)` }}>
                    <div className="tl-titre" onClick={() => basculer(g.cle)}>
                      <Icone de={ChevronRight} className={`triangle pli ${el.replie ? '' : 'ouvert'}`} />
                      <span className="libelle-groupe">{g.libelle}</span>
                      <span className="discret compte-groupe">{g.lignes.length}</span>
                      {g.cle !== CLE_VIDE && !lecture && (
                        <button
                          className="discret ajout-groupe"
                          title="Nouvelle ligne dans ce groupe"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            void creer(g)
                          }}
                        >
                          <Icone de={Plus} />
                        </button>
                      )}
                    </div>
                    <div className="tl-piste" style={{ width: largeur }}>
                      {el.plage && (
                        <div
                          className="tl-enveloppe"
                          style={{ left: x(el.plage.debut), width: (ecartJours(el.plage.debut, el.plage.fin) + 1) * px }}
                          title={`${g.libelle} · ${plageEnTexte(el.plage)} (calculé depuis ses lignes)`}
                        />
                      )}
                    </div>
                  </div>
                )
              }
              if (el.type === 'ajout') {
                return (
                  <div key="ajout" className="tl-ligne" style={{ transform: `translateY(${v.start}px)` }}>
                    <button className="discret tl-titre ajout-ligne" onClick={() => void creer()}>
                      <Icone de={Plus} /> Nouvelle
                    </button>
                  </div>
                )
              }
              const r = el.rangee
              const { ligne, sortira } = r
              const geste = enCours?.chemin === ligne.chemin ? enCours : undefined
              // Une rangée qui porte ses enfants « sur la ligne » leur laisse la place : sa barre s'efface, ses jalons restent.
              const cedee = el.surLaLigne.length > 0
              const plage = cedee ? null : r.plage
              const modifiable = !lecture && r.axe.debut !== undefined && estSaisie(r.axe.debut)
              const aPlacer = !r.plage && !cedee && modifiable
              const titre = titreLigne(ligne, r.axe.schema.champTitre)
              const retrait = (el.groupe !== undefined ? 26 : 8) + el.profondeur * RETRAIT + (enArbre ? RETRAIT : 0)
              return (
                <div
                  key={`${el.groupe ?? ''}/${el.cle}`}
                  className={`tl-ligne ${el.profondeur > 0 ? 'tl-enfant' : ''}`}
                  style={{ transform: `translateY(${v.start}px)`, height: hauteurDe(el) }}
                >
                  <div
                    className={`tl-titre ${sortira ? 'sortira' : ''}`}
                    style={{ paddingLeft: retrait }}
                    onClick={() => ouvrirRangee(r)}
                    title={sortira ? 'Sortira de la vue au prochain rafraîchissement' : undefined}
                  >
                    {el.enfants > 0 && (
                      <button
                        className="discret tl-deplier"
                        style={{ left: retrait - RETRAIT }}
                        aria-label={`${el.replie ? 'Déplier' : 'Replier'} ${titre}`}
                        aria-expanded={!el.replie}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          basculerLigne(el.cle)
                        }}
                      >
                        <Icone de={ChevronRight} className={`pli ${el.replie ? '' : 'ouvert'}`} />
                      </button>
                    )}
                    {titre}
                    {el.etiquette && <span className="discret tl-etiquette">{el.etiquette}</span>}
                  </div>
                  <div
                    className={`tl-piste ${aPlacer ? 'a-placer' : ''}`}
                    style={{ width: largeur }}
                    title={aPlacer ? `Cliquer pour placer à cette date (${r.axe.debut!.nom})` : undefined}
                    onClick={aPlacer ? (ev) => placer(ev, r) : undefined}
                  >
                    {!r.plage && !cedee && el.enveloppe && (
                      <div
                        className="tl-enveloppe"
                        style={{ left: x(el.enveloppe.debut), width: (ecartJours(el.enveloppe.debut, el.enveloppe.fin) + 1) * px }}
                        title={`${titre} · ${plageEnTexte(el.enveloppe)} (calculé depuis ses lignes dépliées)`}
                      />
                    )}
                    {plage && geste && !r.axe.point && <Cadre plage={plageApresGeste(plage, geste.geste, geste.jours)} x={x} px={px} />}
                    {plage && (r.axe.point || plage.debut === plage.fin) && (
                      <Point
                        couleur={r.couleur}
                        jour={plage.debut}
                        titre={titre}
                        masquerTitre={!r.axe.titre}
                        left={x(plage.debut) + px / 2}
                        geste={geste}
                        pose={pose === ligne.chemin}
                        commencer={modifiable ? (ev) => commencer(ev, r, 'deplacer') : undefined}
                        // Une ligne d'un jour qui a une fin s'étire par la droite de son losange, comme une barre.
                        etirer={modifiable && !r.axe.point && r.axe.fin !== undefined && estSaisie(r.axe.fin) ? (ev) => commencer(ev, r, 'fin') : undefined}
                        avant={champsDe(r).avant}
                        champs={champsDe(r).champs}
                        ouvrir={() => ouvrirRangee(r)}
                      />
                    )}
                    {plage && !r.axe.point && plage.debut !== plage.fin && (
                      <Barre
                        couleur={r.couleur}
                        plage={plage}
                        titre={titre}
                        masquerTitre={!r.axe.titre}
                        // Les dates de début et de fin se lisent de part et d'autre de la barre.
                        {...champsDe(r)}
                        x={x}
                        px={px}
                        geste={geste}
                        pose={pose === ligne.chemin}
                        sortira={sortira}
                        commencer={modifiable ? (ev, geste) => commencer(ev, r, geste) : undefined}
                        finModifiable={r.axe.fin !== undefined && estSaisie(r.axe.fin)}
                        ouvrir={() => ouvrirRangee(r)}
                      />
                    )}
                    {r.jalons.map((j) => (
                      <Jalon key={j.colonne.cle} colonne={j.colonne} jour={j.jour} left={x(j.jour) + px / 2} nom={vue.nomsJalons === true} ouvrir={() => ouvrirRangee(r)} />
                    ))}
                    {el.surLaLigne.map(({ rangee: s, sousLigne }) => {
                      const p = s.plage!
                      const g = enCours?.chemin === s.ligne.chemin ? enCours : undefined
                      const deplacable = !lecture && s.axe.debut !== undefined && estSaisie(s.axe.debut)
                      const nom = titreLigne(s.ligne, s.axe.schema.champTitre)
                      return (
                        <div key={s.ligne.chemin} className="tl-sous-ligne" style={{ top: sousLigne * PAS_SOUS_LIGNE }}>
                          {g && !s.axe.point && <Cadre plage={plageApresGeste(p, g.geste, g.jours)} x={x} px={px} />}
                          {s.axe.point || p.debut === p.fin ? (
                            <Point
                              couleur={s.couleur}
                              jour={p.debut}
                              titre={nom}
                              left={x(p.debut) + px / 2}
                              geste={g}
                              pose={pose === s.ligne.chemin}
                              commencer={deplacable ? (ev) => commencer(ev, s, 'deplacer') : undefined}
                              sansTitre
                              ouvrir={() => ouvrirRangee(s)}
                            />
                          ) : (
                            <Barre
                              couleur={s.couleur}
                              plage={p}
                              titre={nom}
                              masquerTitre={!s.axe.titre}
                              // Les barres d'une rangée partagée se touchent : le début et la fin se lisent aux deux bouts, dans la barre.
                              {...champsDe(s)}
                              x={x}
                              px={px}
                              geste={g}
                              pose={pose === s.ligne.chemin}
                              sortira={false}
                              commencer={deplacable ? (ev, geste) => commencer(ev, s, geste) : undefined}
                              finModifiable={s.axe.fin !== undefined && estSaisie(s.axe.fin)}
                              coupee
                              ouvrir={() => ouvrirRangee(s)}
                            />
                          )}
                          {s.jalons.map((j) => (
                            <Jalon key={j.colonne.cle} colonne={j.colonne} jour={j.jour} left={x(j.jour) + px / 2} nom={false} ouvrir={() => ouvrirRangee(s)} />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {bandes.bas.etages > 0 && (
            <div className="tl-pied-bandes">
              <div className="tl-coin" />
              {titresBandes(bandes.bas)}
            </div>
          )}
        </div>
      </div>
      {legende.length > 0 && (
        <div className="tl-legende" aria-label="Légende des couleurs">
          {legende.map((g) => (
            <div key={g.titre} className="groupe-legende">
              <span className="discret">{g.titre}</span>
              {g.options.map((o) => (
                <span key={o.libelle} className="entree-legende">
                  <span className="pastille-legende" style={styleCouleur(o.couleur)} />
                  {o.libelle}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Rangee(p: { graduations: ReturnType<typeof graduations>['haut']; x: (j: string) => number; px: number; classe: string }) {
  return (
    <div className={p.classe}>
      {p.graduations.map((g) => (
        <div key={g.debut} className="tl-graduation" style={{ left: p.x(g.debut), width: g.jours * p.px }}>
          {g.libelle}
        </div>
      ))}
    </div>
  )
}

/** Emplacement où la barre glissée s'accrochera au relâcher. */
function Cadre({ plage, x, px }: { plage: Plage; x: (j: string) => number; px: number }) {
  return (
    <div className="tl-cadre" style={{ left: x(plage.debut), width: (ecartJours(plage.debut, plage.fin) + 1) * px }}>
      <span className="bulle-date">{plageEnTexte(plage)}</span>
    </div>
  )
}

function Barre(p: {
  couleur: string | undefined
  plage: Plage
  titre: string
  /** Titre seulement dans l'infobulle (`sans_titre`). */
  masquerTitre?: boolean
  champs: ReactNode
  /** Champs posés juste avant la barre (sa date de début) et juste après (sa date de fin). */
  avant: ReactNode
  apres: ReactNode
  x: (j: string) => number
  px: number
  geste: EnCours | undefined
  /** Relâchée à l'instant : elle glisse jusqu'à son jour. */
  pose: boolean
  sortira: boolean
  commencer: ((e: PointerReact, geste: Geste) => void) | undefined
  finModifiable: boolean
  /** Sur une rangée partagée : le titre reste dans la barre, coupé, pour ne pas chevaucher la suivante. */
  coupee?: boolean
  ouvrir: () => void
}) {
  // Pendant un geste, la barre suit le pointeur au pixel près, sans passer sous un jour.
  const dx = p.geste?.dx ?? 0
  const base = (ecartJours(p.plage.debut, p.plage.fin) + 1) * p.px
  let left = p.x(p.plage.debut)
  let largeur = base
  if (p.geste?.geste === 'deplacer') left += dx
  if (p.geste?.geste === 'debut') {
    const d = Math.min(dx, base - p.px)
    left += d
    largeur -= d
  }
  if (p.geste?.geste === 'fin') largeur = Math.max(p.px, base + dx)
  // Le titre part de la barre et déborde à droite s'il est plus long (comme Notion) ;
  // une barre trop courte pour l'accueillir le met juste après elle.
  const dedans = largeur >= 36 || p.coupee === true
  // Sur une rangée partagée, les dates tiennent dans la barre : le titre passe avant elles.
  // Trop courte, elle lâche d'abord la fin, puis le début (la plage reste dans l'infobulle).
  const avant = p.coupee && largeur < 140 ? null : p.avant
  const apres = p.coupee && largeur < (avant ? 210 : 140) ? null : p.apres
  return (
    <>
      <div
        className={`tl-barre ${p.coupee ? 'coupee' : ''} ${p.geste ? 'glisse' : ''} ${p.pose ? 'pose' : ''} ${p.sortira ? 'sortira' : ''} ${p.commencer ? 'deplacable' : ''} ${p.couleur ? 'coloree' : ''}`}
        style={{ left, width: Math.max(largeur, 6), ...styleCouleur(p.couleur) }}
        title={`${p.titre} · ${plageEnTexte(p.plage)}`}
        onPointerDown={p.commencer ? (e) => p.commencer!(e, 'deplacer') : undefined}
        onClick={p.commencer ? undefined : p.ouvrir}
      >
        {p.commencer && p.finModifiable && <span className="poignee poignee-debut" onPointerDown={(e) => p.commencer!(e, 'debut')} />}
        {avant && !p.coupee && <span className="champs-bord avant">{avant}</span>}
        {dedans && (!p.coupee || largeur >= 24) && (
          <>
            {/* Au moins la largeur de la barre : la date de fin se pose après la barre, ou après le titre s'il déborde. */}
            <span className="contenu-barre">
              {avant && p.coupee && <span className="champs-bord debut-dedans">{avant}</span>}
              <span className="titre-evt">
                {!p.masquerTitre && p.titre}
                {p.champs}
              </span>
            </span>
            {apres && <span className="champs-bord apres">{apres}</span>}
          </>
        )}
        {p.commencer && p.finModifiable && <span className="poignee poignee-fin" onPointerDown={(e) => p.commencer!(e, 'fin')} />}
      </div>
      {!dedans && (
        <span className="tl-titre-dehors" style={{ left: left + Math.max(largeur, 6) + 6 }}>
          {apres}
          {!p.masquerTitre && p.titre}
          {p.champs}
        </span>
      )}
    </>
  )
}

/** Ligne d'un niveau déplié sans fin : un losange à sa date, qui se glisse. */
/**
 * Losange d'une ligne sur un seul jour : niveau déplié sans fin, ou plage d'un
 * jour (une barre d'un jour ne ferait qu'un début de barre). Il se glisse, et
 * s'étire par sa droite quand la ligne a une fin.
 */
function Point(p: {
  couleur: string | undefined
  jour: string
  titre: string
  /** Titre seulement dans l'infobulle (`sans_titre`). */
  masquerTitre?: boolean
  left: number
  geste: EnCours | undefined
  pose: boolean
  commencer: ((e: PointerReact) => void) | undefined
  etirer?: ((e: PointerReact) => void) | undefined
  /** Date de début affichée, devant le losange ; autres champs après le titre. */
  avant?: ReactNode
  champs?: ReactNode
  /** Sur une rangée partagée : pas de titre à côté du losange (il reste dans l'infobulle). */
  sansTitre?: boolean
  ouvrir: () => void
}) {
  // Étirer ne déplace pas le losange : le cadre pointillé montre la future plage.
  const dx = p.geste?.geste === 'deplacer' ? p.geste.dx : 0
  return (
    <>
      {p.avant && (
        <span className="tl-titre-dehors avant-point" style={{ right: `calc(100% - ${p.left + dx - 12}px)` }}>
          {p.avant}
        </span>
      )}
      {p.etirer && <span className="tl-poignee-point" style={{ left: p.left + dx + 5 }} onPointerDown={p.etirer} title="Tirer pour allonger" />}
      <span
        className={`tl-jalon tl-point ${p.commencer ? 'deplacable' : ''} ${p.geste ? 'glisse' : ''} ${p.pose ? 'pose' : ''} ${p.couleur ? 'coloree' : ''}`}
        style={{ left: p.left + dx, ...styleCouleur(p.couleur) }}
        title={`${p.titre} · ${dateCourte(p.jour)}`}
        onPointerDown={p.commencer}
        onClick={(e) => {
          e.stopPropagation()
          if (!p.commencer) p.ouvrir()
        }}
      />
      {p.geste && (
        <span className="tl-bulle-point" style={{ left: p.left + dx }}>
          <span className="bulle-date">{dateCourte(decaler(p.jour, p.geste.jours))}</span>
        </span>
      )}
      {!p.sansTitre && (
        <span className="tl-titre-dehors" style={{ left: p.left + dx + 12 }}>
          {!p.masquerTitre && p.titre}
          {p.champs}
        </span>
      )}
    </>
  )
}

function Jalon({ colonne, jour, left, nom, ouvrir }: { colonne: Colonne; jour: string; left: number; nom: boolean; ouvrir: () => void }) {
  return (
    <>
      <span
        className="tl-jalon"
        style={{ left }}
        title={`${colonne.nom} · ${dateCourte(jour)}`}
        onClick={(e) => {
          e.stopPropagation()
          ouvrir()
        }}
      />
      {nom && (
        <span className="tl-nom-jalon" style={{ left: left + 9 }}>
          {colonne.nom}
        </span>
      )}
    </>
  )
}
