import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as PointerReact } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDe, estSaisie, type Colonne } from '../core/schema'
import {
  apresGeste,
  decaler,
  ecartJours,
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
import { dateCourte, Echelles, plageEnTexte, titreLigne } from './Calendrier'
import { glisser } from './glisser'
import { useAujourdhui } from './useAujourdhui'

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

type EnCours = { chemin: string; geste: Geste; jours: number }

/**
 * Timeline (spec §7) : une ligne par rangée, une barre du champ de début au
 * champ de fin, les jalons en losanges. Glisser la barre la déplace, ses bords
 * l'étirent. Une ligne sans date se place d'un clic sur sa rangée.
 */
export function Timeline({ espace, base, depot, vue, modifierVue, lignesVue, valeursCreation, retenir, ouvrir }: Props) {
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const [enCours, setEnCours] = useState<EnCours | null>(null)
  const defilement = useRef<HTMLDivElement>(null)
  const schema = depot.schema
  const echelle: Echelle = vue.echelle ?? 'mois'
  const px = PIXELS_PAR_JOUR[echelle]
  const colDebut = vue.champDebut ? colonneDe(schema, vue.champDebut) : undefined
  const colFin = vue.champFin ? colonneDe(schema, vue.champFin) : undefined
  const clesJalons = (vue.champsJalons ?? []).join('|')
  const jalons = useMemo(() => (clesJalons ? clesJalons.split('|') : []).flatMap((c) => colonneDe(schema, c) ?? []), [schema, clesJalons])

  const rangees = useMemo(
    () =>
      lignesVue.map((lv) => ({
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
  const largeur = (ecartJours(e.debut, e.fin) + 1) * px
  const x = (jour: string) => ecartJours(e.debut, jour) * px

  const virtuel = useVirtualizer({
    count: rangees.length + 1,
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
        setEnCours({ chemin: ligne.chemin, geste, jours })
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

  const creer = async () => {
    const ligne = await lancer(espace.creerLigne(base, valeursCreation()))
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
              const r = rangees[v.index]
              if (!r) {
                return (
                  <div key="ajout" className="tl-ligne" style={{ transform: `translateY(${v.start}px)` }}>
                    <button className="discret tl-titre ajout-ligne" onClick={() => void creer()}>
                      + Nouvelle
                    </button>
                  </div>
                )
              }
              const { ligne, sortira } = r.lv
              const glisse = enCours?.chemin === ligne.chemin
              const plage = r.plage && glisse ? plageApresGeste(r.plage, enCours.geste, enCours.jours) : r.plage
              return (
                <div key={ligne.chemin} className="tl-ligne" style={{ transform: `translateY(${v.start}px)` }}>
                  <div
                    className={`tl-titre ${sortira ? 'sortira' : ''}`}
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
                    {plage && (
                      <Barre
                        plage={plage}
                        titre={titreLigne(ligne, schema.champTitre)}
                        x={x}
                        px={px}
                        glisse={glisse}
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

function Barre(p: {
  plage: Plage
  titre: string
  x: (j: string) => number
  px: number
  glisse: boolean
  sortira: boolean
  commencer: ((e: PointerReact, geste: Geste) => void) | undefined
  finModifiable: boolean
  ouvrir: () => void
}) {
  const largeur = (ecartJours(p.plage.debut, p.plage.fin) + 1) * p.px
  // Titre dans la barre quand il y tient, à sa droite sinon.
  const dedans = largeur >= 90
  return (
    <>
      <div
        className={`tl-barre ${p.glisse ? 'glisse' : ''} ${p.sortira ? 'sortira' : ''} ${p.commencer ? 'deplacable' : ''}`}
        style={{ left: p.x(p.plage.debut), width: Math.max(largeur, 6) }}
        title={`${p.titre} · ${plageEnTexte(p.plage)}`}
        onPointerDown={p.commencer ? (e) => p.commencer!(e, 'deplacer') : undefined}
        onClick={p.commencer ? undefined : p.ouvrir}
      >
        {p.commencer && p.finModifiable && <span className="poignee poignee-debut" onPointerDown={(e) => p.commencer!(e, 'debut')} />}
        {dedans && <span className="titre-evt">{p.titre}</span>}
        {p.commencer && p.finModifiable && <span className="poignee poignee-fin" onPointerDown={(e) => p.commencer!(e, 'fin')} />}
      </div>
      {!dedans && (
        <span className="tl-titre-dehors" style={{ left: p.x(p.plage.debut) + Math.max(largeur, 6) + 6 }}>
          {p.titre}
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
