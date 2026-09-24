import { useRef, useState } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { estSaisie, type Colonne, type ColonneChoix } from '../core/schema'
import { lireNombre, type Cellule as ValeurCellule, type Valeur } from '../core/valeurs'
import { couleurOption } from './couleurs'
import { Flottant } from './flottant'

type Props = {
  depot: DepotBase
  ligne: LigneChargee
  colonne: Colonne
  /** Ouvre l'éditeur dès le montage (ligne tout juste créée). */
  editionInitiale?: boolean
  /** Crée une option de select à la volée et renvoie son libellé. */
  creerOption: (cle: string, label: string) => Promise<string>
  surModification: () => void
}

/** Une cellule du tableau : affichage, et édition au clic selon le type. */
export function Cellule({ depot, ligne, colonne, editionInitiale = false, creerOption, surModification }: Props) {
  const [edition, setEdition] = useState(editionInitiale)
  const cellule = ligne.cellules[colonne.cle]
  const modifier = (v: Valeur | undefined) => {
    surModification()
    depot.modifier(ligne.chemin, colonne.cle, v)
  }
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
    return (
      <CelluleChoix
        colonne={colonne}
        cellule={cellule}
        modifier={modifier}
        creer={(label) => creerOption(colonne.cle, label)}
      />
    )
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
  creer: (label: string) => Promise<string>
}) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const ancre = useRef<HTMLDivElement>(null)
  const { colonne, cellule } = p
  const choisis = cellule?.etat === 'ok' ? (Array.isArray(cellule.valeur) ? cellule.valeur : [String(cellule.valeur)]) : []
  const couleur = (label: string) => colonne.options.find((o) => o.label === label)?.couleur

  const fermer = () => {
    setOuvert(false)
    setRecherche('')
  }

  const basculer = (label: string) => {
    if (colonne.type === 'select') {
      p.modifier(choisis[0] === label ? undefined : label)
      fermer()
    } else {
      const suivants = choisis.includes(label) ? choisis.filter((x) => x !== label) : [...choisis, label]
      p.modifier(suivants)
      setRecherche('')
    }
  }

  const texte = recherche.trim()
  const visibles = colonne.options.filter((o) => o.label.toLowerCase().includes(texte.toLowerCase()))
  const exacte = colonne.options.find((o) => o.label === texte)

  const valider = async () => {
    if (texte === '') return
    if (exacte) return basculer(exacte.label)
    if (visibles.length === 1 && visibles[0]) return basculer(visibles[0].label)
    basculer(await p.creer(texte))
  }

  return (
    <div className="cellule" ref={ancre} onClick={() => setOuvert(true)}>
      {cellule?.etat === 'invalide' ? (
        <Avertissement cellule={cellule} />
      ) : (
        choisis.map((l) => <Pastille key={l} label={l} couleur={couleur(l)} />)
      )}
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer}>
          <input
            className="recherche-option"
            autoFocus
            placeholder="Chercher ou créer une option"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void valider()}
          />
          {visibles.map((o) => (
            <button key={o.label} className="option" onClick={() => basculer(o.label)}>
              <span className="coche">{choisis.includes(o.label) ? '✓' : ''}</span>
              <Pastille label={o.label} couleur={o.couleur} />
            </button>
          ))}
          {texte !== '' && !exacte && (
            <button className="option" onClick={() => void valider()}>
              <span className="coche">+</span>
              Créer <Pastille label={texte} />
            </button>
          )}
          {choisis.length > 0 && texte === '' && (
            <button className="option discret" onClick={() => (p.modifier(undefined), fermer())}>
              Vider
            </button>
          )}
        </Flottant>
      )}
    </div>
  )
}
