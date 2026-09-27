import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { couleurOption } from './couleurs'

export type EntreeChoix = {
  valeur: string
  libelle: string
  icone?: LucideIcon
  /** Couleur nommée de l'espace : l'entrée s'affiche en pastille. */
  couleur?: string
  /** Titre de section, affiché avant la première entrée de chaque groupe. */
  groupe?: string
  desactivee?: boolean
}

/** Au-delà, la liste propose une recherche. */
const SEUIL_RECHERCHE = 8

function Libelle({ e }: { e: EntreeChoix }) {
  if (e.couleur) {
    const c = couleurOption(e.couleur)
    return (
      <span className="pastille" style={{ background: c.fond, color: c.texte }}>
        {e.libelle}
      </span>
    )
  }
  return (
    <>
      {e.icone && <Icone de={e.icone} />}
      <span className="libelle-choix">{e.libelle}</span>
    </>
  )
}

/**
 * Liste de choix de l'interface, à la place des `<select>` natifs : un bouton
 * pilule qui ouvre un menu flottant (icônes, pastilles de couleur, recherche
 * au-delà de huit entrées, flèches et Entrée au clavier).
 * Une valeur inconnue (colonne supprimée, ligne disparue) reste affichée, avec
 * un avertissement, plutôt que remplacée en silence.
 */
export function Choix(p: {
  valeur: string
  entrees: EntreeChoix[]
  changer: (v: string) => void
  /** Texte quand rien n'est choisi. */
  vide?: string
  /** Nom accessible du bouton. */
  libelle?: string
  /** Libellé d'une valeur inconnue (par défaut, la valeur elle-même). */
  inconnue?: string
  desactive?: boolean
  className?: string
}) {
  const bouton = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const actuelle = p.entrees.find((e) => e.valeur === p.valeur)

  const fermer = () => {
    setOuvert(false)
    bouton.current?.focus()
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={`choix ${p.className ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-label={p.libelle}
        disabled={p.desactive}
        // Le menu se ferme au mousedown extérieur : sans ceci, recliquer le bouton le rouvrirait aussitôt.
        onMouseDown={(e) => ouvert && e.stopPropagation()}
        onClick={() => setOuvert((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOuvert(true)
          }
        }}
      >
        <span className="valeur-choix">
          {actuelle ? (
            <Libelle e={actuelle} />
          ) : p.valeur ? (
            <>
              <Icone de={TriangleAlert} className="alerte" />
              <span className="libelle-choix">{p.inconnue ?? p.valeur}</span>
            </>
          ) : (
            <span className="libelle-choix discret">{p.vide ?? 'Choisir'}</span>
          )}
        </span>
        <Icone de={ChevronDown} className="chevron-choix" taille={14} />
      </button>
      {ouvert && (
        <Flottant ancre={bouton.current} fermer={fermer}>
          <ListeChoix
            entrees={p.entrees}
            valeur={p.valeur}
            choisir={(v) => {
              fermer()
              if (v !== p.valeur) p.changer(v)
            }}
          />
        </Flottant>
      )}
    </>
  )
}

function ListeChoix(p: { entrees: EntreeChoix[]; valeur: string; choisir: (v: string) => void }) {
  const [recherche, setRecherche] = useState('')
  const avecRecherche = p.entrees.length > SEUIL_RECHERCHE
  const texte = recherche.trim().toLocaleLowerCase('fr')
  const visibles = texte ? p.entrees.filter((e) => e.libelle.toLocaleLowerCase('fr').includes(texte)) : p.entrees
  const choisissables = visibles.filter((e) => !e.desactivee)
  const [active, setActive] = useState(() => Math.max(0, choisissables.findIndex((e) => e.valeur === p.valeur)))
  const liste = useRef<HTMLDivElement>(null)
  const saisie = useRef<HTMLInputElement>(null)
  const courante = choisissables[Math.min(active, choisissables.length - 1)]

  useEffect(() => (avecRecherche ? saisie.current : liste.current)?.focus(), [avecRecherche])
  useEffect(() => {
    liste.current?.querySelector('.option.active')?.scrollIntoView({ block: 'nearest' })
  }, [courante])

  const clavier = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = choisissables.length
      if (n) setActive((i) => (Math.min(i, n - 1) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (courante) p.choisir(courante.valeur)
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  let groupe: string | undefined
  return (
    <div className="liste-choix" onKeyDown={clavier}>
      {avecRecherche && (
        <label className="recherche-choix">
          <Icone de={Search} taille={14} />
          <input
            ref={saisie}
            value={recherche}
            placeholder="Rechercher"
            aria-label="Rechercher"
            onChange={(e) => {
              setRecherche(e.target.value)
              setActive(0)
            }}
          />
        </label>
      )}
      <div ref={liste} role="listbox" tabIndex={-1} className="options-choix">
        {visibles.length === 0 && <div className="discret aucun-choix">Aucun résultat</div>}
        {visibles.map((e) => {
          const titre = e.groupe !== groupe ? e.groupe : undefined
          groupe = e.groupe
          return (
            <div key={e.valeur} className="entree-choix">
              {titre && <div className="groupe-choix">{titre}</div>}
              <button
                type="button"
                role="option"
                aria-selected={e.valeur === p.valeur}
                disabled={e.desactivee}
                tabIndex={-1}
                className={`option ${e === courante ? 'active' : ''}`}
                onMouseMove={() => {
                  const i = choisissables.indexOf(e)
                  if (i >= 0 && e !== courante) setActive(i)
                }}
                onClick={() => p.choisir(e.valeur)}
              >
                <Libelle e={e} />
                <span className="coche">{e.valeur === p.valeur && <Icone de={Check} taille={14} />}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
