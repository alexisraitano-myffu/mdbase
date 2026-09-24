import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { estSaisie, type Colonne, type ColonneChoix } from '../core/schema'
import { lireNombre, type Cellule as ValeurCellule, type Valeur } from '../core/valeurs'
import { couleurOption } from './couleurs'

type Props = {
  depot: DepotBase
  ligne: LigneChargee
  colonne: Colonne
  /** Ouvre l'éditeur dès le montage (ligne tout juste créée). */
  editionInitiale?: boolean
}

/** Une cellule du tableau : affichage, et édition au clic selon le type. */
export function Cellule({ depot, ligne, colonne, editionInitiale = false }: Props) {
  const [edition, setEdition] = useState(editionInitiale)
  const cellule = ligne.cellules[colonne.cle]
  const modifier = (v: Valeur | undefined) => depot.modifier(ligne.chemin, colonne.cle, v)
  const estTitre = colonne.cle === depot.schema.champTitre

  if (!estSaisie(colonne)) {
    return <div className="cellule calculee">{colonne.type === 'relation' ? '' : '—'}</div>
  }

  if (colonne.type === 'checkbox') {
    const coche = cellule?.etat === 'ok' && cellule.valeur === true
    return (
      <div className="cellule">
        {cellule?.etat === 'invalide' && <Avertissement cellule={cellule} />}
        <input type="checkbox" checked={coche} onChange={(e) => modifier(e.target.checked)} />
      </div>
    )
  }

  if (colonne.type === 'select' || colonne.type === 'multiselect') {
    return <CelluleChoix colonne={colonne} cellule={cellule} modifier={modifier} />
  }

  if (colonne.type === 'relation') {
    const ids = cellule?.etat === 'ok' && Array.isArray(cellule.valeur) ? cellule.valeur : []
    return <div className="cellule calculee">{ids.join(', ')}</div>
  }

  const quitter = () => {
    setEdition(false)
    if (estTitre) void depot.renommerSelonTitre(ligne.chemin)
  }

  if (edition) {
    const texte = cellule?.etat === 'ok' ? String(cellule.valeur) : cellule ? String(cellule.brut) : ''
    if (colonne.type === 'number') return <EditeurNombre initial={texte} modifier={modifier} quitter={quitter} />
    if (colonne.type === 'date') return <EditeurDate initial={texte} modifier={modifier} quitter={quitter} />
    return (
      <input
        className="cellule editeur"
        autoFocus
        value={cellule?.etat === 'ok' ? String(cellule.valeur) : texte}
        onChange={(e) => modifier(e.target.value)}
        onBlur={quitter}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
      />
    )
  }

  return (
    <div className={`cellule ${estTitre ? 'titre' : ''}`} onClick={() => setEdition(true)}>
      {cellule?.etat === 'invalide' ? (
        <Avertissement cellule={cellule} />
      ) : cellule && colonne.type === 'url' ? (
        <a href={String(cellule.valeur)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          {String(cellule.valeur)}
        </a>
      ) : cellule && colonne.type === 'date' ? (
        formaterDate(String(cellule.valeur))
      ) : cellule && colonne.type === 'number' ? (
        Number(cellule.valeur).toLocaleString('fr-FR')
      ) : (
        cellule && String(cellule.valeur)
      )}
    </div>
  )
}

function Avertissement({ cellule }: { cellule: Extract<ValeurCellule, { etat: 'invalide' }> }) {
  return (
    <span className="invalide" title={cellule.raison}>
      ⚠ {typeof cellule.brut === 'object' ? JSON.stringify(cellule.brut) : String(cellule.brut)}
    </span>
  )
}

function EditeurNombre(p: { initial: string; modifier: (v: number | undefined) => void; quitter: () => void }) {
  const [saisie, setSaisie] = useState(p.initial)
  const lu = lireNombre(saisie)
  return (
    <input
      className={`cellule editeur nombre ${lu === null ? 'refuse' : ''}`}
      autoFocus
      inputMode="decimal"
      value={saisie}
      onChange={(e) => {
        setSaisie(e.target.value)
        const n = lireNombre(e.target.value)
        if (n !== null) p.modifier(n)
      }}
      onBlur={p.quitter}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
    />
  )
}

function EditeurDate(p: { initial: string; modifier: (v: string | undefined) => void; quitter: () => void }) {
  const avecHeure = p.initial.includes('T')
  return (
    <input
      className="cellule editeur"
      type={avecHeure ? 'datetime-local' : 'date'}
      autoFocus
      defaultValue={p.initial}
      onChange={(e) => p.modifier(e.target.value || undefined)}
      onBlur={p.quitter}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
    />
  )
}

function formaterDate(iso: string): string {
  const [date, heure] = iso.split('T')
  const [a, m, j] = (date ?? '').split('-')
  return `${j}/${m}/${a}${heure ? ` ${heure}` : ''}`
}

export function Pastille({ label, couleur }: { label: string; couleur?: string | undefined }) {
  const c = couleurOption(couleur)
  return (
    <span className="pastille" style={{ background: c.fond, color: c.texte }}>
      {label}
    </span>
  )
}

function CelluleChoix(p: {
  colonne: ColonneChoix
  cellule: ValeurCellule | undefined
  modifier: (v: Valeur | undefined) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLDivElement>(null)
  const { colonne, cellule } = p
  const choisis = cellule?.etat === 'ok' ? (Array.isArray(cellule.valeur) ? cellule.valeur : [String(cellule.valeur)]) : []
  const couleur = (label: string) => colonne.options.find((o) => o.label === label)?.couleur

  const basculer = (label: string) => {
    if (colonne.type === 'select') {
      p.modifier(choisis[0] === label ? undefined : label)
      setOuvert(false)
    } else {
      const suivants = choisis.includes(label) ? choisis.filter((x) => x !== label) : [...choisis, label]
      p.modifier(suivants)
    }
  }

  return (
    <div className="cellule" ref={ancre} onClick={() => setOuvert(true)}>
      {cellule?.etat === 'invalide' ? (
        <Avertissement cellule={cellule} />
      ) : (
        choisis.map((l) => <Pastille key={l} label={l} couleur={couleur(l)} />)
      )}
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          {colonne.options.length === 0 && <div className="discret">Aucune option</div>}
          {colonne.options.map((o) => (
            <button key={o.label} className="option" onClick={() => basculer(o.label)}>
              <span className="coche">{choisis.includes(o.label) ? '✓' : ''}</span>
              <Pastille label={o.label} couleur={o.couleur} />
            </button>
          ))}
          {choisis.length > 0 && (
            <button className="option discret" onClick={() => (p.modifier(undefined), setOuvert(false))}>
              Vider
            </button>
          )}
        </Flottant>
      )}
    </div>
  )
}

/** Panneau flottant sous une ancre, fermé par un clic extérieur ou Échap. */
function Flottant(p: { ancre: HTMLElement | null; fermer: () => void; children: ReactNode }) {
  const panneau = useRef<HTMLDivElement>(null)
  const { fermer } = p
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (!panneau.current?.contains(e.target as Node)) fermer()
    }
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('mousedown', clic)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', clic)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer])
  const r = p.ancre?.getBoundingClientRect()
  return (
    <div
      ref={panneau}
      className="flottant"
      style={{ top: (r?.bottom ?? 0) + 2, left: r?.left ?? 0, minWidth: r?.width ?? 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      {p.children}
    </div>
  )
}
