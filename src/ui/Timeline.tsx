import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as PointerReact, type ReactNode } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDe, estSaisie, type Colonne } from '../core/schema'
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
import type { ModificationVue, Vue } from '../core/vue'
import { useLancer } from './actions'
import { ValeurCompacte } from './cellules'
import { dateCourte, Echelles, plageEnTexte, titreLigne } from './Calendrier'
import { titreDe, useEspace } from './contexte-espace'
import { glisser } from './glisser'
import { useAujourdhui } from './useAujourdhui'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Icone } from './icones'

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
}

/** Largeur d'un jour selon le zoom, en pixels. */
const PIXELS_PAR_JOUR: Record<Echelle, number> = { semaine: 36, mois: 12, trimestre: 4 }
const HAUTEUR_LIGNE = 36
const LARGEUR_TITRES = 240

/** Geste en cours : la barre suit le pointeur au pixel (`dx`), le cadre d'arrivée montre le jour où elle s'accrochera. */
type EnCours = { chemin: string; geste: Geste; jours: number; dx: number }

type Rangee = { lv: LigneVue; plage: Plage | null; jalons: { colonne: Colonne; jour: string }[] }
/** Rangées affichées : en-têtes de groupe (repliables), lignes, et la rangée « + Nouvelle ». */
type Element =
  | { type: 'groupe'; groupe: Groupe; plage: Plage | null; replie: boolean }
  | { type: 'ligne'; rangee: Rangee; groupe?: string }
  | { type: 'ajout' }

/**
 * Timeline (spec §7) : une ligne par rangée, une barre du champ de début au
 * champ de fin, les jalons en losanges. Glisser la barre la déplace, ses bords
 * l'étirent. Une ligne sans date se place d'un clic sur sa rangée.
 */
export function Timeline({ espace, base, depot, vue, modifierVue, lignesVue, valeursCreation, retenir, ouvrir }: Props) {
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const [enCours, setEnCours] = useState<EnCours | null>(null)
  // Groupes repliés : le temps de la session, comme au tableau.
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set())
  const { etat } = useEspace()
  const defilement = useRef<HTMLDivElement>(null)
  const schema = depot.schema
  const echelle: Echelle = vue.echelle ?? 'mois'
  const px = PIXELS_PAR_JOUR[echelle]
  const colDebut = vue.champDebut ? colonneDe(schema, vue.champDebut) : undefined
  const colFin = vue.champFin ? colonneDe(schema, vue.champFin) : undefined
  const clesJalons = (vue.champsJalons ?? []).join('|')
  const champs = (vue.champsCarte ?? []).flatMap((c) => colonneDe(schema, c) ?? [])
  const jalons = useMemo(() => (clesJalons ? clesJalons.split('|') : []).flatMap((c) => colonneDe(schema, c) ?? []), [schema, clesJalons])

  const colGroupe = vue.groupe ? groupables(schema).find((c) => c.cle === vue.groupe) : undefined

  const rangees = useMemo(
    () =>
      lignesVue.map((lv): Rangee => ({
        lv,
        plage: colDebut ? plageDe(lv.ligne, colDebut, colFin) : null,
        jalons: jalons.flatMap((c) => {
          const cellule = lv.ligne.cellules[c.cle]
          const jour = cellule?.etat === 'ok' ? jourDe(cellule.valeur) : null
          return jour ? [{ colonne: c, jour }] : []
        }),
      })),
    [lignesVue, colDebut, colFin, jalons],
  )
  const e = useMemo(
    () =>
      etendue(
        rangees.flatMap((r) => [...(r.plage ? [r.plage] : []), ...r.jalons.map((j) => ({ debut: j.jour, fin: j.jour }))]),
        aujourdhui,
      ),
    [rangees, aujourdhui],
  )
  const { haut, bas } = useMemo(() => graduations(e, echelle), [e, echelle])

  // Groupée, chaque groupe a une barre d'en-tête qui couvre les plages de ses lignes (calculée, non déplaçable).
  const elements = useMemo((): Element[] => {
    if (!colGroupe) return [...rangees.map((rangee): Element => ({ type: 'ligne', rangee })), { type: 'ajout' }]
    const parChemin = new Map(rangees.map((r) => [r.lv.ligne.chemin, r]))
    const cible = colGroupe.type === 'relation' ? colGroupe.cible : null
    return [
      ...grouper(lignesVue, colGroupe, (id) => (cible ? titreDe(etat, cible, id) : null)).flatMap((g): Element[] => {
        const siennes = g.lignes.map((l) => parChemin.get(l.ligne.chemin)!)
        const replie = replies.has(g.cle)
        const entete: Element = { type: 'groupe', groupe: g, plage: enveloppe(siennes.map((r) => r.plage)), replie }
        return replie ? [entete] : [entete, ...siennes.map((rangee): Element => ({ type: 'ligne', rangee, groupe: g.cle }))]
      }),
      { type: 'ajout' },
    ]
  }, [rangees, lignesVue, colGroupe, replies, etat])
  const largeur = (ecartJours(e.debut, e.fin) + 1) * px
  const x = (jour: string) => ecartJours(e.debut, jour) * px

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

  const modifiable = estSaisie(colDebut)
  const finModifiable = colFin !== undefined && estSaisie(colFin)

  const commencer = (ev: PointerReact, ligne: LigneChargee, geste: Geste) => {
    let jours = 0
    glisser(ev, {
      bouger: (dx) => {
        jours = Math.round(dx / px)
        setEnCours({ chemin: ligne.chemin, geste, jours, dx })
      },
      finir: () => {
        setEnCours(null)
        const modifs = apresGeste(ligne, geste, jours, colDebut, colFin)
        if (Object.keys(modifs).length === 0) return
        retenir(ligne.id)
        for (const [cle, v] of Object.entries(modifs)) depot.modifier(ligne.chemin, cle, v)
      },
      cliquer: () => ouvrir(ligne),
      annuler: () => setEnCours(null),
    })
  }

  /** Place une ligne sans date au jour cliqué sur sa rangée. */
  const placer = (ev: MouseEvent<HTMLDivElement>, ligne: LigneChargee) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const jour = decaler(e.debut, Math.floor((ev.clientX - r.left) / px))
    retenir(ligne.id)
    depot.modifier(ligne.chemin, colDebut.cle, jour)
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
                      {g.cle !== CLE_VIDE && (
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
              const { ligne, sortira } = r.lv
              const geste = enCours?.chemin === ligne.chemin ? enCours : undefined
              const plage = r.plage
              return (
                <div key={`${el.groupe ?? ''}/${ligne.chemin}`} className="tl-ligne" style={{ transform: `translateY(${v.start}px)` }}>
                  <div
                    className={`tl-titre ${sortira ? 'sortira' : ''} ${el.groupe !== undefined ? 'dans-groupe' : ''}`}
                    onClick={() => ouvrir(ligne)}
                    title={sortira ? 'Sortira de la vue au prochain rafraîchissement' : undefined}
                  >
                    {titreLigne(ligne, schema.champTitre)}
                  </div>
                  <div
                    className={`tl-piste ${!plage && modifiable ? 'a-placer' : ''}`}
                    style={{ width: largeur }}
                    title={!plage && modifiable ? `Cliquer pour placer à cette date (${colDebut.nom})` : undefined}
                    onClick={!plage && modifiable ? (ev) => placer(ev, ligne) : undefined}
                  >
                    {plage && geste && <Cadre plage={plageApresGeste(plage, geste.geste, geste.jours)} x={x} px={px} />}
                    {plage && (
                      <Barre
                        plage={plage}
                        titre={titreLigne(ligne, schema.champTitre)}
                        champs={champs.map((c) => (
                          <span key={c.cle} className="champ-carte">
                            <ValeurCompacte base={base} ligne={ligne} colonne={c} />
                          </span>
                        ))}
                        x={x}
                        px={px}
                        geste={geste}
                        sortira={sortira}
                        commencer={modifiable ? (ev, geste) => commencer(ev, ligne, geste) : undefined}
                        finModifiable={finModifiable}
                        ouvrir={() => ouvrir(ligne)}
                      />
                    )}
                    {r.jalons.map((j) => (
                      <Jalon key={j.colonne.cle} colonne={j.colonne} jour={j.jour} left={x(j.jour) + px / 2} ouvrir={() => ouvrir(ligne)} />
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
