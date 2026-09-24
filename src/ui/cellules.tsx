import { useRef, useState, type ReactNode } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { colonne as colonneDe, estSaisie, natureDe, type Colonne, type ColonneChoix, type ColonneRelation } from '../core/schema'
import { lireNombre, type Cellule as ValeurCellule, type Valeur } from '../core/valeurs'
import { couleurOption } from './couleurs'
import { Flottant } from './flottant'
import { useLancer } from './actions'
import { titreDe, useEspace } from './contexte-espace'

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

  if (colonne.type === 'relation') {
    return <CelluleRelation base={depot.schema.id} ligne={ligne} colonne={colonne} surModification={surModification} />
  }

  if (!estSaisie(colonne)) return <CelluleCalculee base={depot.schema.id} cellule={cellule} colonne={colonne} />

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
      ⚠{' '}
      {cellule.brut === undefined
        ? 'erreur'
        : typeof cellule.brut === 'object'
          ? JSON.stringify(cellule.brut)
          : String(cellule.brut)}
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

/** Relation, des deux côtés : titres des lignes liées en pastilles, menu pour lier ou délier (spec §5). */
function CelluleRelation(p: { base: string; ligne: LigneChargee; colonne: ColonneRelation; surModification: () => void }) {
  const { espace, etat } = useEspace()
  const lancer = useLancer()
  const ancre = useRef<HTMLDivElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const { colonne, ligne } = p
  const cellule = ligne.cellules[colonne.cle]
  const ids = cellule?.etat === 'ok' && Array.isArray(cellule.valeur) ? cellule.valeur : []

  const changer = (suivants: string[]) => {
    p.surModification()
    void lancer(Promise.resolve().then(() => espace.modifierRelation(p.base, ligne.id, colonne.cle, suivants)))
  }
  const basculer = (id: string) => changer(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])

  const texte = normaliser(recherche.trim())
  const candidats = [...(etat.titres.get(colonne.cible) ?? new Map<string, string>())]
    .filter(([, titre]) => normaliser(titre).includes(texte))
    .sort(([a], [b]) => Number(ids.includes(b)) - Number(ids.includes(a)))
    .slice(0, 50)
  const casses = ids.filter((id) => titreDe(etat, colonne.cible, id) === null)

  return (
    <div className="cellule" ref={ancre} onClick={() => setOuvert(true)}>
      {cellule?.etat === 'invalide' ? (
        <Avertissement cellule={cellule} />
      ) : (
        ids.map((id) => {
          const titre = titreDe(etat, colonne.cible, id)
          return titre === null ? (
            <span key={id} className="lien-casse" title="Lien cassé : aucune ligne ne porte cet id">
              ⚠ {id}
            </span>
          ) : (
            <span key={id} className="pastille-relation">
              {titre}
            </span>
          )
        })
      )}
      {ouvert && (
        <Flottant
          ancre={ancre.current}
          fermer={() => {
            setOuvert(false)
            setRecherche('')
          }}
        >
          <input
            className="recherche-option"
            autoFocus
            placeholder="Chercher une ligne à lier"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {casses.map((id) => (
            <button key={id} className="option" onClick={() => basculer(id)} title="Retirer ce lien cassé">
              <span className="coche">✓</span>
              <span className="lien-casse">⚠ {id}</span>
            </button>
          ))}
          {candidats.map(([id, titre]) => (
            <button key={id} className="option" onClick={() => basculer(id)}>
              <span className="coche">{ids.includes(id) ? '✓' : ''}</span>
              {titre || 'Sans titre'}
            </button>
          ))}
          {candidats.length === 0 && <div className="option discret">Aucune ligne</div>}
        </Flottant>
      )}
    </div>
  )
}

/** Rollup (et bientôt formule) : lecture seule, affiché selon la nature du résultat. */
function CelluleCalculee(p: { base: string; cellule: ValeurCellule | undefined; colonne: Colonne }) {
  const { etat } = useEspace()
  const { cellule, colonne } = p
  if (!cellule) return <div className="cellule calculee" />
  if (cellule.etat === 'invalide') {
    return (
      <div className="cellule">
        <Avertissement cellule={cellule} />
      </div>
    )
  }
  const v = cellule.valeur
  let contenu: ReactNode = String(v)
  switch (natureDe(colonne)) {
    case 'nombre': {
      const n = Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
      contenu = colonne.type === 'rollup' && colonne.calcul.startsWith('pourcent') ? `${n} %` : n
      break
    }
    case 'date':
      contenu = formaterDate(String(v))
      break
    case 'case':
      contenu = v === true ? '☑' : '☐'
      break
    case 'liste': {
      // Rollup « afficher » : on montre les valeurs comme dans leur colonne d'origine.
      const champ = champRemonte(etat, p.base, colonne)
      const valeurs = Array.isArray(v) ? v : [String(v)]
      contenu = valeurs.map((x, i) =>
        champ?.type === 'relation' ? (
          <span key={i} className="pastille-relation">
            {titreDe(etat, champ.cible, x) ?? `⚠ ${x}`}
          </span>
        ) : champ?.type === 'select' || champ?.type === 'multiselect' ? (
          <Pastille key={i} label={x} couleur={champ.options.find((o) => o.label === x)?.couleur} />
        ) : (
          <span key={i}>{i > 0 ? `, ${x}` : x}</span>
        ),
      )
      break
    }
  }
  return <div className="cellule calculee">{contenu}</div>
}

/** Colonne de la base liée que remonte un rollup. */
function champRemonte(etat: ReturnType<typeof useEspace>['etat'], base: string, c: Colonne): Colonne | undefined {
  if (c.type !== 'rollup') return undefined
  const schema = etat.bases.get(base)?.depot?.schema
  const relation = schema && colonneDe(schema, c.relation)
  if (relation?.type !== 'relation') return undefined
  const cible = etat.bases.get(relation.cible)?.depot?.schema
  return cible && colonneDe(cible, c.champ)
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Valeur en lecture seule, compacte, pour les cartes du kanban et de la collection. */
export function ValeurCompacte({ base, ligne, colonne }: { base: string; ligne: LigneChargee; colonne: Colonne }) {
  const { etat } = useEspace()
  const c = ligne.cellules[colonne.cle]
  if (colonne.type === 'rollup' || colonne.type === 'formula') {
    return c ? <CelluleCalculee base={base} cellule={c} colonne={colonne} /> : null
  }
  if (!c) return null
  if (c.etat === 'invalide') return <Avertissement cellule={c} />
  const v = c.valeur
  switch (colonne.type) {
    case 'select':
      return <Pastille label={String(v)} couleur={colonne.options.find((o) => o.label === v)?.couleur} />
    case 'multiselect':
      return (
        <>
          {(Array.isArray(v) ? v : []).map((x) => (
            <Pastille key={x} label={x} couleur={colonne.options.find((o) => o.label === x)?.couleur} />
          ))}
        </>
      )
    case 'relation':
      return (
        <>
          {(Array.isArray(v) ? v : []).map((id) => (
            <span key={id} className="pastille-relation">
              {titreDe(etat, colonne.cible, id) ?? `⚠ ${id}`}
            </span>
          ))}
        </>
      )
    case 'checkbox':
      return v === true ? <span>☑ {colonne.nom}</span> : null
    case 'date':
      return <span>{formaterDate(String(v))}</span>
    case 'number':
      return <span>{Number(v).toLocaleString('fr-FR')}</span>
    default:
      return <span>{String(v)}</span>
  }
}
