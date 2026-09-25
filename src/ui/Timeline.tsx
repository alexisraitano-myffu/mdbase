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
  apresGeste,
  decaler,
  ecartJours,
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
import { glisser } from './glisser'
import { useAujourdhui } from './useAujourdhui'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Icone } from './icones'
import { useConsultation } from './mode'

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
const HAUTEUR_LIGNE = 36
const LARGEUR_TITRES = 240
/** Retrait d'un niveau déplié dans la colonne des titres. */
const RETRAIT = 18

/** Geste en cours : la barre suit le pointeur au pixel (`dx`), le cadre d'arrivée montre le jour où elle s'accrochera. */
type EnCours = { chemin: string; geste: Geste; jours: number; dx: number }

/** Ce qui place une ligne dans le temps : sa base et les colonnes de dates de son niveau. */
type Axe = { base: string; depot: DepotBase; schema: Schema; debut?: Colonne; fin?: Colonne; jalons: Colonne[]; /** Niveau déplié sans fin : des losanges. */ point: boolean }
type Rangee = { ligne: LigneChargee; sortira: boolean; axe: Axe; plage: Plage | null; jalons: { colonne: Colonne; jour: string }[] }
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
    }
  | { type: 'ajout' }

function axeDe(depot: DepotBase, base: string, debut?: string, fin?: string, jalons: readonly string[] = [], niveau = false): Axe {
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
  }
}

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
  // Groupes repliés : le temps de la session, comme au tableau.
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const [lignesRepliees, basculerLigne] = useReplis(`mdbase.timeline.${base}.${vue.id}`)
  const { etat } = useEspace()
  const defilement = useRef<HTMLDivElement>(null)
  const schema = depot.schema
  const echelle: Echelle = vue.echelle ?? 'mois'
  const px = PIXELS_PAR_JOUR[echelle]
  const clesJalons = (vue.champsJalons ?? []).join('|')
  const champs = (vue.champsCarte ?? []).flatMap((c) => colonneDe(schema, c) ?? [])
  const axe = useMemo(
    () => axeDe(depot, base, vue.champDebut, vue.champFin, clesJalons ? clesJalons.split('|') : []),
    [depot, base, vue.champDebut, vue.champFin, clesJalons, schema], // eslint-disable-line react-hooks/exhaustive-deps -- le schéma change sans que le dépôt change
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
        axes.set(n.niveau, d ? axeDe(d, n.base, n.niveau.champDebut, n.niveau.champFin, n.niveau.champsJalons, true) : null)
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

  const e = useMemo(
    () => etendue([...rangees.flatMap(plagesDe), ...[...rangeesNoeuds.values()].flatMap((x) => plagesDe(x.rangee))], aujourdhui),
    [rangees, rangeesNoeuds, aujourdhui],
  )
  const { haut, bas } = useMemo(() => graduations(e, echelle), [e, echelle])

  const elements = useMemo((): Element[] => {
    /** Plages de tous les descendants d'un nœud (ou d'une ligne de premier niveau). */
    const couvertes = (enfants: readonly Noeud[]): Plage[] =>
      enfants.flatMap((n) => [...plagesDe(rangeesNoeuds.get(n.cle)?.rangee ?? rangeeDe(n.ligne, false, axe)), ...couvertes(n.enfants)])
    const visibles = (n: Noeud) => n.enfants.filter((x) => rangeesNoeuds.has(x.cle))
    const deroule = (noeuds: readonly Noeud[], groupe: string | undefined, freres: number): Element[] =>
      noeuds.flatMap((n): Element[] => {
        const x = rangeesNoeuds.get(n.cle)
        if (!x) return []
        const enfants = visibles(n)
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
        }
        return [el, ...(replie ? [] : deroule(enfants, groupe, n.niveau.deplier.length))]
      })
    const premierNiveau = (rangee: Rangee, groupe?: string): Element[] => {
      const cle = `${base}:${rangee.ligne.id}`
      const enfants = (arbres.get(cle)?.[0] ?? []).map((x) => x.noeud)
      const replie = lignesRepliees.has(cle)
      const el: Element = {
        type: 'ligne',
        rangee,
        groupe,
        cle,
        profondeur: 0,
        enfants: enfants.length,
        replie,
        enveloppe: rangee.plage ? null : enveloppe(couvertes(enfants)),
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

  const virtuel = useVirtualizer({
    count: elements.length,
    getScrollElement: () => defilement.current,
    estimateSize: () => HAUTEUR_LIGNE,
    overscan: 10,
  })

  // Aujourd'hui en vue à l'ouverture et à chaque changement de zoom.
  const allerA = (jour: string) => {
    const el = defilement.current
    if (el) el.scrollLeft = Math.max(0, x(jour) - (el.clientWidth - LARGEUR_TITRES) / 3)
  }
  useLayoutEffect(() => allerA(aujourdhui), [echelle]) // volontairement : seulement au zoom, pas à chaque nouvelle étendue
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
        <Echelles valeurs={['semaine', 'mois', 'trimestre']} active={echelle} changer={(echelle) => modifierVue({ echelle })} />
        <button className="discret" onClick={() => allerA(aujourdhui)}>
          Aujourd'hui
        </button>
      </div>
      <div className="timeline" ref={defilement}>
        <div style={{ width: LARGEUR_TITRES + largeur }}>
          <div className="tl-entete">
            <div className="tl-coin">{colDebut.nom}</div>
            <div className="tl-graduations" style={{ width: largeur }}>
              <Rangee graduations={haut} x={x} px={px} classe="tl-haut" />
              <Rangee graduations={bas} x={x} px={px} classe="tl-bas" />
            </div>
          </div>
          <div className="tl-corps" style={{ height: virtuel.getTotalSize() }}>
            <div className="tl-fond" style={{ left: LARGEUR_TITRES, width: largeur }}>
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
                      <Icone de={el.replie ? ChevronRight : ChevronDown} className="triangle" />
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
              const plage = r.plage
              const modifiable = !lecture && r.axe.debut !== undefined && estSaisie(r.axe.debut)
              const titre = titreLigne(ligne, r.axe.schema.champTitre)
              const retrait = (el.groupe !== undefined ? 26 : 8) + el.profondeur * RETRAIT + (enArbre ? RETRAIT : 0)
              return (
                <div
                  key={`${el.groupe ?? ''}/${el.cle}`}
                  className={`tl-ligne ${el.profondeur > 0 ? 'tl-enfant' : ''}`}
                  style={{ transform: `translateY(${v.start}px)` }}
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
                        <Icone de={el.replie ? ChevronRight : ChevronDown} />
                      </button>
                    )}
                    {titre}
                    {el.etiquette && <span className="discret tl-etiquette">{el.etiquette}</span>}
                  </div>
                  <div
                    className={`tl-piste ${!plage && modifiable ? 'a-placer' : ''}`}
                    style={{ width: largeur }}
                    title={!plage && modifiable ? `Cliquer pour placer à cette date (${r.axe.debut!.nom})` : undefined}
                    onClick={!plage && modifiable ? (ev) => placer(ev, r) : undefined}
                  >
                    {!plage && el.enveloppe && (
                      <div
                        className="tl-enveloppe"
                        style={{ left: x(el.enveloppe.debut), width: (ecartJours(el.enveloppe.debut, el.enveloppe.fin) + 1) * px }}
                        title={`${titre} · ${plageEnTexte(el.enveloppe)} (calculé depuis ses lignes dépliées)`}
                      />
                    )}
                    {plage && geste && !r.axe.point && <Cadre plage={plageApresGeste(plage, geste.geste, geste.jours)} x={x} px={px} />}
                    {plage && r.axe.point && (
                      <Point
                        jour={plage.debut}
                        titre={titre}
                        left={x(plage.debut) + px / 2}
                        geste={geste}
                        commencer={modifiable ? (ev) => commencer(ev, r, 'deplacer') : undefined}
                        ouvrir={() => ouvrirRangee(r)}
                      />
                    )}
                    {plage && !r.axe.point && (
                      <Barre
                        plage={plage}
                        titre={titre}
                        champs={
                          premier(r)
                            ? champs.map((c) => (
                                <span key={c.cle} className="champ-carte">
                                  <ValeurCompacte base={base} ligne={ligne} colonne={c} />
                                </span>
                              ))
                            : null
                        }
                        x={x}
                        px={px}
                        geste={geste}
                        sortira={sortira}
                        commencer={modifiable ? (ev, geste) => commencer(ev, r, geste) : undefined}
                        finModifiable={r.axe.fin !== undefined && estSaisie(r.axe.fin)}
                        ouvrir={() => ouvrirRangee(r)}
                      />
                    )}
                    {r.jalons.map((j) => (
                      <Jalon key={j.colonne.cle} colonne={j.colonne} jour={j.jour} left={x(j.jour) + px / 2} ouvrir={() => ouvrirRangee(r)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
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
  plage: Plage
  titre: string
  champs: ReactNode
  x: (j: string) => number
  px: number
  geste: EnCours | undefined
  sortira: boolean
  commencer: ((e: PointerReact, geste: Geste) => void) | undefined
  finModifiable: boolean
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
  // Titre dans la barre quand il y tient, à sa droite sinon.
  const dedans = largeur >= 90
  return (
    <>
      <div
        className={`tl-barre ${p.geste ? 'glisse' : ''} ${p.sortira ? 'sortira' : ''} ${p.commencer ? 'deplacable' : ''}`}
        style={{ left, width: Math.max(largeur, 6) }}
        title={`${p.titre} · ${plageEnTexte(p.plage)}`}
        onPointerDown={p.commencer ? (e) => p.commencer!(e, 'deplacer') : undefined}
        onClick={p.commencer ? undefined : p.ouvrir}
      >
        {p.commencer && p.finModifiable && <span className="poignee poignee-debut" onPointerDown={(e) => p.commencer!(e, 'debut')} />}
        {dedans && (
          <span className="titre-evt">
            {p.titre}
            {p.champs}
          </span>
        )}
        {p.commencer && p.finModifiable && <span className="poignee poignee-fin" onPointerDown={(e) => p.commencer!(e, 'fin')} />}
      </div>
      {!dedans && (
        <span className="tl-titre-dehors" style={{ left: left + Math.max(largeur, 6) + 6 }}>
          {p.titre}
          {p.champs}
        </span>
      )}
    </>
  )
}

/** Ligne d'un niveau déplié sans fin : un losange à sa date, qui se glisse. */
function Point(p: { jour: string; titre: string; left: number; geste: EnCours | undefined; commencer: ((e: PointerReact) => void) | undefined; ouvrir: () => void }) {
  const dx = p.geste?.dx ?? 0
  return (
    <>
      <span
        className={`tl-jalon tl-point ${p.commencer ? 'deplacable' : ''} ${p.geste ? 'glisse' : ''}`}
        style={{ left: p.left + dx }}
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
      <span className="tl-titre-dehors" style={{ left: p.left + dx + 12 }}>
        {p.titre}
      </span>
    </>
  )
}

function Jalon({ colonne, jour, left, ouvrir }: { colonne: Colonne; jour: string; left: number; ouvrir: () => void }) {
  return (
    <span
      className="tl-jalon"
      style={{ left }}
      title={`${colonne.nom} · ${dateCourte(jour)}`}
      onClick={(e) => {
        e.stopPropagation()
        ouvrir()
      }}
    />
  )
}
