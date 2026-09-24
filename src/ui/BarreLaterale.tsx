import { useRef, useState, type DragEvent } from 'react'
import type { DepotEspace, EtatEspace } from '../core/depot-espace'
import { useLancer } from './actions'
import { Flottant } from './flottant'

type Props = {
  espace: DepotEspace
  etat: EtatEspace
  nomEspace: string
  choisie: string | null
  choisir: (id: string) => void
  changerDossier: () => void
}

/** Barre latérale (spec §2) : groupes plats de bases, glisser-déposer entre groupes. */
export function BarreLaterale({ espace, etat, nomEspace, choisie, choisir, changerDossier }: Props) {
  const lancer = useLancer()
  const [creation, setCreation] = useState<'base' | 'groupe' | null>(null)
  const [cible, setCible] = useState<string | null>(null)

  const nomBase = (id: string) => {
    const c = etat.bases.get(id)?.chargement
    return c?.ok ? c.base.schema.nom : id
  }

  /** Zone de dépôt : un groupe (null = hors groupe), à une position donnée. */
  const deposable = (cleCible: string, groupe: string | null, index?: number) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setCible(cleCible)
    },
    onDragLeave: () => setCible(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setCible(null)
      const base = e.dataTransfer.getData('text/base')
      if (base) void lancer(espace.placerBase(base, groupe, index))
    },
  })

  const entrees = (bases: string[], groupe: string | null) =>
    bases.map((id, index) => (
      <EntreeBase
        key={id}
        nom={nomBase(id)}
        active={id === choisie}
        cible={cible === `base:${id}`}
        choisir={() => choisir(id)}
        renommer={(nom) => void lancer(espace.renommerBase(id, nom))}
        glisser={(e) => e.dataTransfer.setData('text/base', id)}
        {...deposable(`base:${id}`, groupe, index)}
      />
    ))

  return (
    <nav className="barre-laterale">
      <MenuEspace nom={nomEspace} changerDossier={changerDossier} />

      {etat.groupes.map((g) => (
        <section key={g.nom} className={`groupe ${cible === `groupe:${g.nom}` ? 'cible' : ''}`} {...deposable(`groupe:${g.nom}`, g.nom)}>
          <EnteteGroupe
            nom={g.nom}
            renommer={(nouveau) => void lancer(espace.renommerGroupe(g.nom, nouveau))}
            supprimer={() => void lancer(espace.supprimerGroupe(g.nom))}
          />
          {entrees(g.bases, g.nom)}
          {g.bases.length === 0 && <div className="vide">Glisse une base ici</div>}
        </section>
      ))}

      <section className={`groupe ${cible === 'hors' ? 'cible' : ''}`} {...deposable('hors', null)}>
        {etat.groupes.length > 0 && <div className="titre-groupe discret">Hors groupe</div>}
        {entrees(etat.horsGroupe, null)}
      </section>

      {creation ? (
        <ChampEnLigne
          placeholder={creation === 'base' ? 'Nom de la base' : 'Nom du groupe'}
          valider={async (nom) => {
            setCreation(null)
            if (creation === 'groupe') return void lancer(espace.ajouterGroupe(nom))
            const id = await lancer(espace.creerBase(nom))
            if (id) choisir(id)
          }}
          annuler={() => setCreation(null)}
        />
      ) : (
        <>
          <button className="discret ajout-barre" onClick={() => setCreation('base')}>
            + Nouvelle base
          </button>
          <button className="discret ajout-barre" onClick={() => setCreation('groupe')}>
            + Nouveau groupe
          </button>
        </>
      )}
    </nav>
  )
}

function EntreeBase(p: {
  nom: string
  active: boolean
  cible: boolean
  choisir: () => void
  renommer: (nom: string) => void
  glisser: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
}) {
  const [edition, setEdition] = useState(false)
  if (edition) {
    return (
      <ChampEnLigne
        initial={p.nom}
        valider={(nom) => {
          setEdition(false)
          if (nom !== p.nom) p.renommer(nom)
        }}
        annuler={() => setEdition(false)}
      />
    )
  }
  return (
    <div
      className={`entree-base ${p.active ? 'active' : ''} ${p.cible ? 'cible' : ''}`}
      draggable
      onDragStart={p.glisser}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onClick={p.choisir}
      onDoubleClick={() => setEdition(true)}
      title="Double-clic pour renommer"
    >
      {p.nom}
    </div>
  )
}

function EnteteGroupe(p: { nom: string; renommer: (nom: string) => void; supprimer: () => void }) {
  const [edition, setEdition] = useState(false)
  const [menu, setMenu] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  if (edition) {
    return (
      <ChampEnLigne
        initial={p.nom}
        valider={(nom) => {
          setEdition(false)
          if (nom !== p.nom) p.renommer(nom)
        }}
        annuler={() => setEdition(false)}
      />
    )
  }
  return (
    <div className="titre-groupe">
      <span onDoubleClick={() => setEdition(true)}>{p.nom}</span>
      <button ref={ancre} className="discret menu-groupe" onClick={() => setMenu(true)} aria-label="Options du groupe">
        ⋯
      </button>
      {menu && (
        <Flottant ancre={ancre.current} fermer={() => setMenu(false)}>
          <button className="option" onClick={() => (setMenu(false), setEdition(true))}>
            Renommer
          </button>
          <button className="option" onClick={() => (setMenu(false), p.supprimer())}>
            Supprimer le groupe (les bases restent)
          </button>
        </Flottant>
      )}
    </div>
  )
}

function ChampEnLigne(p: {
  initial?: string
  placeholder?: string
  valider: (valeur: string) => void
  annuler: () => void
}) {
  const [valeur, setValeur] = useState(p.initial ?? '')
  const fini = useRef(false)
  const terminer = (garder: boolean) => {
    if (fini.current) return
    fini.current = true
    if (garder && valeur.trim() !== '') p.valider(valeur.trim())
    else p.annuler()
  }
  return (
    <input
      className="champ-en-ligne"
      autoFocus
      placeholder={p.placeholder}
      value={valeur}
      onChange={(e) => setValeur(e.target.value)}
      onBlur={() => terminer(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') terminer(true)
        if (e.key === 'Escape') terminer(false)
      }}
    />
  )
}

/** Nom de l'espace en tête de barre, qui ouvre le choix du dossier. */
function MenuEspace({ nom, changerDossier }: { nom: string; changerDossier: () => void }) {
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ancre} className="nom-espace" onClick={() => setOuvert(true)} title="Changer de dossier">
        <span className="icone-espace">▣</span>
        <span className="texte-espace">{nom}</span>
        <span className="chevron">▾</span>
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="option discret">Dossier ouvert : {nom}</div>
          <button
            className="option"
            onClick={() => {
              setOuvert(false)
              changerDossier()
            }}
          >
            Ouvrir un autre dossier…
          </button>
        </Flottant>
      )}
    </>
  )
}
