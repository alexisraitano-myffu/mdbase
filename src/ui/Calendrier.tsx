import { useMemo, useState, type ReactNode, type PointerEvent as PointerReact } from 'react'
import { createPortal } from 'react-dom'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDe, estSaisie, type Colonne } from '../core/schema'
import {
  ajouterMois,
  apresGeste,
  decaler,
  ecartJours,
  grilleMois,
  JOURS_COURTS,
  libelleMois,
  lundiDe,
  MOIS_COURTS,
  placerSemaine,
  plageApresGeste,
  plageDe,
  type Geste,
  type Plage,
} from '../core/temps'
import type { ModificationVue, Vue } from '../core/vue'
import { useLancer } from './actions'
import { ValeurCompacte } from './cellules'
import { glisser } from './glisser'
import { useAujourdhui } from './useAujourdhui'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
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

/**
 * Geste en cours : la ligne glissée et son décalage en jours. Pour un
 * déplacement, la carte suit le pointeur librement (`fantome`) et les jours
 * d'arrivée s'éclairent ; elle s'accroche à ces jours au relâcher.
 */
type EnCours = {
  chemin: string
  geste: Geste
  jours: number
  fantome?: { x: number; y: number; decalX: number; decalY: number; largeur: number }
}

/**
 * Calendrier (spec §7) : mois ou semaine, une ligne par jour de son champ de
 * date, étalée jusqu'au champ de fin s'il y en a un. Glisser une ligne change
 * sa date, étirer son bord droit change sa fin.
 */
export function Calendrier({ espace, base, depot, vue, modifierVue, lignesVue, valeursCreation, retenir, ouvrir }: Props) {
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const [curseur, setCurseur] = useState(aujourdhui)
  const [enCours, setEnCours] = useState<EnCours | null>(null)
  const schema = depot.schema
  const colDebut = vue.champDebut ? colonneDe(schema, vue.champDebut) : undefined
  const colFin = vue.champFin ? colonneDe(schema, vue.champFin) : undefined
  const semaine = vue.echelle === 'semaine'
  const champs = (vue.champsCarte ?? []).flatMap((c) => colonneDe(schema, c) ?? [])

  const elements = useMemo(() => {
    if (!colDebut) return []
    return lignesVue.flatMap((lv) => {
      const plage = plageDe(lv.ligne, colDebut, colFin)
      return plage ? [{ element: lv, plage }] : []
    })
  }, [lignesVue, colDebut, colFin])

  if (!colDebut) return <p className="discret">Choisis le champ de date du calendrier dans « Options ».</p>

  const modifiable = estSaisie(colDebut)
  const finModifiable = colFin !== undefined && estSaisie(colFin)
  const semaines = semaine ? [Array.from({ length: 7 }, (_, i) => decaler(lundiDe(curseur), i))] : grilleMois(curseur)
  // Étirer : la barre suit jour par jour. Déplacer : elle reste en place, les jours d'arrivée s'éclairent.
  const glissee = enCours ? elements.find((e) => e.element.ligne.chemin === enCours.chemin) : undefined
  const avecApercu =
    enCours && enCours.geste !== 'deplacer'
      ? elements.map((e) => (e === glissee ? { ...e, plage: plageApresGeste(e.plage, enCours.geste, enCours.jours) } : e))
      : elements
  const cible = enCours?.geste === 'deplacer' && glissee ? plageApresGeste(glissee.plage, 'deplacer', enCours.jours) : null

  const commencer = (ev: PointerReact, ligne: LigneChargee, geste: Geste) => {
    const depart = jourSous(ev.clientX, ev.clientY)
    if (!depart) return
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    const decalX = ev.clientX - r.left
    const decalY = ev.clientY - r.top
    let jours = 0
    glisser(ev, {
      bouger: (_dx, e) => {
        // Hors de la grille, on garde le dernier jour survolé.
        const jour = jourSous(e.clientX, e.clientY)
        if (jour) jours = ecartJours(depart, jour)
        setEnCours({
          chemin: ligne.chemin,
          geste,
          jours,
          ...(geste === 'deplacer' && { fantome: { x: e.clientX, y: e.clientY, decalX, decalY, largeur: r.width } }),
        })
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

  const creer = async (jour: string) => {
    const ligne = await lancer(espace.creerLigne(base, { ...valeursCreation(), [colDebut.cle]: jour }))
    if (!ligne) return
    retenir(ligne.id)
    ouvrir(ligne)
  }

  const periode = semaine ? libelleSemaine(semaines[0]!) : libelleMois(curseur)
  const sansDate = lignesVue.length - elements.length

  return (
    <div className="calendrier">
      <div className="barre-temps">
        <strong className="periode">{periode}</strong>
        {sansDate > 0 && (
          <span className="discret">
            {sansDate} ligne{sansDate > 1 ? 's' : ''} sans date
          </span>
        )}
        <span className="espaceur" />
        <Echelles valeurs={['mois', 'semaine']} active={semaine ? 'semaine' : 'mois'} changer={(echelle) => modifierVue({ echelle })} />
        <button className="discret" onClick={() => setCurseur(semaine ? decaler(curseur, -7) : ajouterMois(curseur, -1))} aria-label="Précédent">
          <Icone de={ChevronLeft} />
        </button>
        <button className="discret" onClick={() => setCurseur(aujourdhui)}>
          Aujourd'hui
        </button>
        <button className="discret" onClick={() => setCurseur(semaine ? decaler(curseur, 7) : ajouterMois(curseur, 1))} aria-label="Suivant">
          <Icone de={ChevronRight} />
        </button>
      </div>
      <div className="cal-jours-semaine">
        {JOURS_COURTS.map((j) => (
          <div key={j}>{j}</div>
        ))}
      </div>
      <div className={`cal-grille ${semaine ? 'cal-une-semaine' : ''}`}>
        {semaines.map((jours) => (
          <Semaine
            key={jours[0]}
            jours={jours}
            mois={semaine ? null : curseur.slice(0, 7)}
            aujourdhui={aujourdhui}
            segments={placerSemaine(avecApercu, jours[0]!)}
            cible={cible}
            contenu={(l) => <ContenuEvt base={base} ligne={l} titre={titreLigne(l, schema.champTitre)} champs={champs} />}
            enCours={enCours?.chemin}
            modifiable={modifiable}
            finModifiable={finModifiable}
            commencer={commencer}
            ouvrir={ouvrir}
            creer={modifiable ? (j) => void creer(j) : undefined}
          />
        ))}
      </div>
      {enCours?.fantome &&
        glissee &&
        createPortal(
          <div
            className="cal-evt cal-fantome"
            style={{ left: enCours.fantome.x - enCours.fantome.decalX, top: enCours.fantome.y - enCours.fantome.decalY, width: enCours.fantome.largeur }}
          >
            <ContenuEvt base={base} ligne={glissee.element.ligne} titre={titreLigne(glissee.element.ligne, schema.champTitre)} champs={champs} />
            {cible && <span className="bulle-date">{plageEnTexte(cible)}</span>}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Titre et champs choisis d'une ligne, dans une case du calendrier. */
function ContenuEvt({ base, ligne, titre, champs }: { base: string; ligne: LigneChargee; titre: string; champs: Colonne[] }) {
  return (
    <>
      <span className="titre-evt">{titre}</span>
      {champs.map((c) => (
        <div key={c.cle} className="champ-carte">
          <ValeurCompacte base={base} ligne={ligne} colonne={c} />
        </div>
      ))}
    </>
  )
}

function Semaine(p: {
  jours: string[]
  /** Mois affiché (`AAAA-MM`) : les jours des mois voisins sont grisés. Null en vue semaine. */
  mois: string | null
  aujourdhui: string
  segments: ReturnType<typeof placerSemaine<LigneVue>>
  /** Jours d'arrivée de la ligne en cours de déplacement. */
  cible: Plage | null
  contenu: (l: LigneChargee) => ReactNode
  enCours: string | undefined
  modifiable: boolean
  finModifiable: boolean
  commencer: (e: PointerReact, l: LigneChargee, geste: Geste) => void
  ouvrir: (l: LigneChargee) => void
  creer: ((jour: string) => void) | undefined
}) {
  const rangs = p.segments.reduce((m, s) => Math.max(m, s.rang + 1), 0)
  return (
    <div className="cal-semaine" data-lundi={p.jours[0]} style={{ gridTemplateRows: `28px repeat(${rangs}, auto) 1fr` }}>
      {p.jours.map((j, i) => (
        <div
          key={j}
          className={[
            'cal-jour',
            p.mois && j.slice(0, 7) !== p.mois && 'hors-mois',
            j === p.aujourdhui && 'aujourdhui',
            p.cible && j >= p.cible.debut && j <= p.cible.fin && 'cible',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ gridColumn: i + 1 }}
        >
          <span className="num-jour">{Number(j.slice(8)) === 1 ? `1 ${MOIS_COURTS[Number(j.slice(5, 7)) - 1]}` : Number(j.slice(8))}</span>
          {p.creer && (
            <button className="discret ajout-jour" title="Nouvelle ligne à cette date" onClick={() => p.creer!(j)}>
              <Icone de={Plus} />
            </button>
          )}
        </div>
      ))}
      {p.segments.map((s) => {
        const { ligne, sortira } = s.element
        return (
          <div
            key={ligne.chemin}
            className={[
              'cal-evt',
              s.coupeAvant && 'coupe-avant',
              s.coupeApres && 'coupe-apres',
              sortira && 'sortira',
              p.enCours === ligne.chemin && (p.cible ? 'origine' : 'glisse'),
              p.modifiable && 'deplacable',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ gridColumn: `${s.colonne + 1} / span ${s.largeur}`, gridRow: s.rang + 2 }}
            title={plageEnTexte(s.plage)}
            onPointerDown={p.modifiable ? (e) => p.commencer(e, ligne, 'deplacer') : undefined}
            onClick={p.modifiable ? undefined : () => p.ouvrir(ligne)}
          >
            {p.contenu(ligne)}
            {p.enCours === ligne.chemin && !p.cible && !s.coupeApres && <span className="bulle-date">{plageEnTexte(s.plage)}</span>}
            {p.finModifiable && !s.coupeApres && <span className="poignee poignee-fin" onPointerDown={(e) => p.commencer(e, ligne, 'fin')} />}
          </div>
        )
      })}
    </div>
  )
}

/** Boutons d'échelle (mois / semaine, ou semaine / mois / trimestre) : réglage enregistré dans la vue. */
export function Echelles<T extends string>({ valeurs, active, changer }: { valeurs: T[]; active: T; changer: (v: T) => void }) {
  const libelles: Record<string, string> = { semaine: 'Semaine', mois: 'Mois', trimestre: 'Trimestre' }
  return (
    <div className="echelles">
      {valeurs.map((v) => (
        <button key={v} className={`discret ${v === active ? 'actif' : ''}`} onClick={() => v !== active && changer(v)}>
          {libelles[v] ?? v}
        </button>
      ))}
    </div>
  )
}

/** Jour sous le pointeur : la semaine survolée, puis la colonne dans cette semaine. */
function jourSous(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const semaine = (el as HTMLElement).closest<HTMLElement>('[data-lundi]')
    if (!semaine) continue
    const r = semaine.getBoundingClientRect()
    const col = Math.min(6, Math.max(0, Math.floor(((x - r.left) / r.width) * 7)))
    return decaler(semaine.dataset.lundi!, col)
  }
  return null
}

export function titreLigne(ligne: LigneChargee, champTitre: string): string {
  const t = ligne.cellules[champTitre]
  return t?.etat === 'ok' && String(t.valeur) !== '' ? String(t.valeur) : 'Sans titre'
}

export function dateCourte(iso: string): string {
  return `${Number(iso.slice(8))} ${MOIS_COURTS[Number(iso.slice(5, 7)) - 1]}`
}

export function plageEnTexte(p: Plage): string {
  return p.debut === p.fin ? dateCourte(p.debut) : `${dateCourte(p.debut)} → ${dateCourte(p.fin)}`
}

function libelleSemaine(jours: string[]): string {
  return `Semaine du ${dateCourte(jours[0]!)} au ${dateCourte(jours[6]!)} ${jours[6]!.slice(0, 4)}`
}

