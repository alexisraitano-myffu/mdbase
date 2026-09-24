import { useRef, useState, type DragEvent } from 'react'
import type { DepotEspace, EtatEspace } from '../core/depot-espace'
import { useLancer } from './actions'
import type { Selection } from './App'
import { Flottant } from './flottant'

type Props = {
  espace: DepotEspace
  etat: EtatEspace
  nomEspace: string
  selection: Selection | null
  choisir: (id: string) => void
  choisirDashboard: (id: string) => void
  changerDossier: () => void
  /** Ouvre la recherche globale. */
  chercher: () => void
}

/** Barre latérale (spec §2) : groupes plats de bases, glisser-déposer entre groupes. */
export function BarreLaterale({ espace, etat, nomEspace, selection, choisir, choisirDashboard, changerDossier, chercher }: Props) {
  const lancer = useLancer()
  const [creation, setCreation] = useState<'base' | 'groupe' | 'dashboard' | null>(null)
  const choisie = selection?.type === 'base' ? selection.id : null
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
      <div className="nom-espace">{nomEspace}</div>
      <button className="discret bouton-recherche" onClick={chercher}>
        <span className="icone">⌕</span>
        Rechercher
        <kbd className="discret">{/Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl+K'}</kbd>
      </button>

      <section className="groupe dashboards">
        <div className="titre-groupe">
          <span>Dashboards</span>
          <button className="discret menu-groupe" onClick={() => setCreation('dashboard')} aria-label="Nouveau dashboard" title="Nouveau dashboard">
            +
          </button>
        </div>
        {etat.dashboards.map((d) => (
          <EntreeDashboard
            key={d.id}
            nom={d.dashboard?.nom ?? d.id}
            active={selection?.type === 'dashboard' && selection.id === d.id}
            choisir={() => choisirDashboard(d.id)}
            renommer={(nom) => void lancer(espace.modifierDashboard(d.id, { type: 'renommer', nom }))}
            supprimer={() => void lancer(espace.supprimerDashboard(d.id))}
          />
        ))}
        {creation === 'dashboard' && (
          <ChampEnLigne
            placeholder="Nom du dashboard"
            valider={async (nom) => {
              setCreation(null)
              const id = await lancer(espace.creerDashboard(nom))
              if (id) choisirDashboard(id)
            }}
            annuler={() => setCreation(null)}
          />
        )}
      </section>

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

      {creation && creation !== 'dashboard' ? (
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

      <button className="discret changer" onClick={changerDossier}>
        Changer de dossier
      </button>
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

function EntreeDashboard(p: { nom: string; active: boolean; choisir: () => void; renommer: (nom: string) => void; supprimer: () => void }) {
  const [edition, setEdition] = useState(false)
  const [menu, setMenu] = useState<'options' | 'confirmer' | null>(null)
  const ancre = useRef<HTMLDivElement>(null)
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
      ref={ancre}
      className={`entree-base ${p.active ? 'active' : ''}`}
      onClick={p.choisir}
      onDoubleClick={() => setEdition(true)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu('options')
      }}
      title="Double-clic pour renommer, clic droit pour plus"
    >
      <span className="icone">▦</span> {p.nom}
      {menu && (
        <Flottant ancre={ancre.current} fermer={() => setMenu(null)}>
          {menu === 'options' ? (
            <>
              <button className="option" onClick={() => (setMenu(null), setEdition(true))}>
                Renommer
              </button>
              <button className="option danger-texte" onClick={() => setMenu('confirmer')}>
                Supprimer le dashboard…
              </button>
            </>
          ) : (
            <div className="confirmation">
              <strong>Supprimer « {p.nom} » ?</strong>
              <p>Le fichier du dashboard et ses vues propres sont supprimés. Les bases et leurs vues ne changent pas.</p>
              <div className="boutons">
                <button onClick={() => setMenu(null)}>Annuler</button>
                <button className="danger" onClick={() => (setMenu(null), p.supprimer())}>
                  Supprimer
                </button>
              </div>
            </div>
          )}
        </Flottant>
      )}
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
