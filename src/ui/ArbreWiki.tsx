import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ChevronRight, File, FileText, LayoutTemplate, Plus } from 'lucide-react'
import type { DepotEspace, EtatEspace } from '../core/depot-espace'
import { MODELES_WIKI_LIVRES, type ModeleWiki } from '../core/modeles-wiki'
import { arbreWiki, citePage, placementWiki, type NoeudWiki, type PositionDepot } from '../core/wiki'
import { useLancer } from './actions'
import { BasculeSection, BoutonMenuEntree, ChampEnLigne } from './BarreLaterale'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { useConsultation } from './mode'

// Arbre du wiki dans la barre latérale (spec §22) : les pages à plat de
// `_wiki/`, rangées par leur clé `parent`. Une page qui a des sous-pages sert de
// dossier ; il n'y a pas d'autre sorte de dossier. Glisser une page la range :
// sur le haut ou le bas d'une entrée, avant ou après elle ; au milieu, dedans.

/** Page en cours de glisser : `dataTransfer` ne se lit pas pendant le survol. */
let glissee: string | null = null

type Cible = { id: string | null; position: PositionDepot }

export function SectionWiki(p: {
  espace: DepotEspace
  etat: EtatEspace
  ouverte: string | null
  ouvrir: (id: string) => void
  replis: ReadonlySet<string>
  basculer: (cle: string) => void
}) {
  const lancer = useLancer()
  const lecture = useConsultation()
  const { pages } = p.etat.wiki
  const arbre = useMemo(() => arbreWiki(pages), [pages])
  // Nouvelle page : d'abord le choix (page vide ou modèle), puis le titre.
  const [choix, setChoix] = useState<{ parent: string | null; ancre: HTMLElement | null } | null>(null)
  const [creation, setCreation] = useState<{ parent: string | null; modele?: ModeleWiki } | null>(null)
  const nouvelle = (parent: string | null, ancre: HTMLElement | null) => {
    if (parent !== null && p.replis.has(`wiki:${parent}`)) p.basculer(`wiki:${parent}`)
    setCreation(null)
    setChoix({ parent, ancre })
  }
  const [cible, setCible] = useState<Cible | null>(null)
  const replie = p.replis.has('wiki')

  const creer = async (titre: string, parent: string | null, modele?: ModeleWiki) => {
    setCreation(null)
    const page = await lancer((async () => p.espace.creerPageWiki({ titre, parent, ...(modele && { corps: modele.corps }) }))())
    if (page) p.ouvrir(page.id)
  }

  const deposer = (id: string, c: Cible) => {
    if (c.id === null) {
      // Sur la tête de la section : à la racine, en dernier.
      const racine = pages.filter((x) => x.parent === null && x.id !== id)
      const dernier = Math.max(0, ...racine.map((x) => x.ordre ?? 0))
      return void lancer((async () => p.espace.deplacerPageWiki(id, null, dernier + 1))())
    }
    const place = placementWiki(pages, id, c.id, c.position)
    if (place) void lancer((async () => p.espace.deplacerPageWiki(id, place.parent, place.ordre))())
  }

  /** Pages du wiki et lignes qui citent l'une des pages supprimées, hors de celles qui partent. */
  const citations = (partent: readonly string[]) => {
    const cite = (texte: string) => partent.some((x) => citePage(texte, x))
    let n = 0
    for (const x of pages) if (!partent.includes(x.id) && cite(x.corps)) n++
    for (const b of p.etat.bases.values()) for (const l of b.depot?.lignes() ?? []) if (cite(l.corps)) n++
    return n
  }

  const ligne = (n: NoeudWiki, profondeur: number): ReactNode => {
    const id = n.page.id
    const ferme = p.replis.has(`wiki:${id}`)
    return (
      <div key={id} role="treeitem" aria-expanded={n.enfants.length > 0 ? !ferme : undefined} aria-selected={id === p.ouverte}>
        <EntreePage
          noeud={n}
          profondeur={profondeur}
          active={id === p.ouverte}
          ferme={ferme}
          cible={cible?.id === id ? cible.position : null}
          ouvrir={() => p.ouvrir(id)}
          basculer={() => p.basculer(`wiki:${id}`)}
          renommer={(titre) => void lancer(p.espace.renommerPageWiki(id, titre))}
          sousPage={(ancre) => nouvelle(id, ancre)}
          portee={() => {
            const partent = p.espace.porteeSuppressionPageWiki(id)
            return { sousPages: partent.length - 1, citations: citations(partent) }
          }}
          supprimer={() => void lancer(p.espace.supprimerPageWiki(id))}
          survol={(e) => {
            if (lecture || glissee === null) return
            const r = e.currentTarget.getBoundingClientRect()
            const y = (e.clientY - r.top) / r.height
            const position: PositionDepot = y < 0.25 ? 'avant' : y > 0.75 ? 'apres' : 'dans'
            if (!placementWiki(pages, glissee, id, position)) return
            e.preventDefault()
            e.stopPropagation()
            if (cible?.id !== id || cible.position !== position) setCible({ id, position })
          }}
          lacher={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const g = glissee
            setCible(null)
            glissee = null
            if (g && cible) deposer(g, cible)
          }}
          quitter={() => setCible(null)}
        />
        {!ferme && n.enfants.map((e) => ligne(e, profondeur + 1))}
        {!ferme && creation?.parent === id && (
          <div style={{ paddingLeft: `${(profondeur + 1) * 0.9}rem` }}>
            <ChampEnLigne placeholder={creation.modele ? `Titre (${creation.modele.nom})` : 'Titre de la sous-page'} valider={(t) => void creer(t, id, creation.modele)} annuler={() => setCreation(null)} />
          </div>
        )}
      </div>
    )
  }

  // Repliée, la section garde la page ouverte visible, pour qu'on voie où l'on est.
  const ouverteSeule = replie && p.ouverte ? pages.find((x) => x.id === p.ouverte) : undefined

  return (
    <section
      className={`groupe wiki ${cible?.id === null ? 'cible' : ''}`}
      onDragOver={(e) => {
        if (lecture || glissee === null) return
        e.preventDefault()
        setCible({ id: null, position: 'dans' })
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCible(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const g = glissee
        setCible(null)
        glissee = null
        if (g) deposer(g, { id: null, position: 'dans' })
      }}
    >
      <div className="titre-groupe">
        <BasculeSection nom="Wiki" replie={replie} basculer={() => p.basculer('wiki')} caches={pages.length - (ouverteSeule ? 1 : 0)} />
        {!lecture && (
          <button className="discret menu-groupe" onClick={(e) => nouvelle(null, e.currentTarget)} aria-label="Nouvelle page" title="Nouvelle page">
            <Icone de={Plus} />
          </button>
        )}
      </div>
      {replie ? (
        ouverteSeule && (
          <div className="entree-base entree-wiki active">
            <Icone de={FileText} />
            <span className="nom-entree">{ouverteSeule.titre || 'Sans titre'}</span>
          </div>
        )
      ) : (
        <div role="tree" aria-label="Pages du wiki">
          {arbre.map((n) => ligne(n, 0))}
        </div>
      )}
      {!replie && pages.length === 0 && creation === null && !lecture && <div className="vide">Aucune page : « + » pour en créer une</div>}
      {creation?.parent === null && (
        <ChampEnLigne placeholder={creation.modele ? `Titre (${creation.modele.nom})` : 'Titre de la page'} valider={(t) => void creer(t, null, creation.modele)} annuler={() => setCreation(null)} />
      )}
      {choix && (
        <Flottant ancre={choix.ancre} fermer={() => setChoix(null)}>
          <ChoixModele
            modeles={p.etat.wiki.modeles}
            choisir={(modele) => {
              setChoix(null)
              setCreation({ parent: choix.parent, ...(modele && { modele }) })
            }}
          />
        </Flottant>
      )}
    </section>
  )
}

function EntreePage(p: {
  noeud: NoeudWiki
  profondeur: number
  active: boolean
  ferme: boolean
  cible: PositionDepot | null
  ouvrir: () => void
  basculer: () => void
  renommer: (titre: string) => void
  sousPage: (ancre: HTMLElement | null) => void
  portee: () => { sousPages: number; citations: number }
  supprimer: () => void
  survol: (e: DragEvent<HTMLDivElement>) => void
  lacher: (e: DragEvent<HTMLDivElement>) => void
  quitter: () => void
}) {
  const [edition, setEdition] = useState(false)
  const [menu, setMenu] = useState<'options' | { sousPages: number; citations: number } | null>(null)
  const ancre = useRef<HTMLDivElement>(null)
  const lecture = useConsultation()
  const { page, enfants, signale } = p.noeud
  const titre = page.titre || 'Sans titre'
  const retrait = { paddingLeft: `${0.2 + p.profondeur * 0.9}rem` }
  const chevron =
    enfants.length > 0 ? (
      <button
        className="discret chevron-wiki"
        aria-label={p.ferme ? `Déplier ${titre}` : `Replier ${titre}`}
        onClick={(e) => {
          e.stopPropagation()
          p.basculer()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Icone de={ChevronRight} taille={12} className={p.ferme ? '' : 'deplie'} />
      </button>
    ) : (
      <span className="chevron-wiki" aria-hidden />
    )
  if (edition) {
    return (
      <div style={retrait}>
        <ChampEnLigne
          initial={page.titre}
          valider={(t) => {
            setEdition(false)
            if (t !== page.titre) p.renommer(t)
          }}
          annuler={() => setEdition(false)}
        />
      </div>
    )
  }
  if (lecture) {
    return (
      <div className={`entree-base entree-wiki ${p.active ? 'active' : ''}`} style={retrait} onClick={p.ouvrir}>
        {chevron}
        <Icone de={FileText} />
        <span className="nom-entree">{titre}</span>
      </div>
    )
  }
  return (
    <div
      ref={ancre}
      className={`entree-base entree-wiki ${p.active ? 'active' : ''} ${p.cible ? `cible-${p.cible}` : ''}`}
      style={retrait}
      draggable
      onDragStart={(e) => {
        glissee = page.id
        e.dataTransfer.setData('text/page-wiki', page.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => {
        glissee = null
        p.quitter()
      }}
      onDragOver={p.survol}
      onDragLeave={p.quitter}
      onDrop={p.lacher}
      onClick={p.ouvrir}
      onDoubleClick={() => setEdition(true)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu('options')
      }}
      title={signale === 'boucle' ? 'Ses parents forment une boucle : affichée à la racine' : signale ? 'Sa page parente est introuvable : affichée à la racine' : 'Double-clic pour renommer, glisser pour ranger'}
    >
      {chevron}
      <Icone de={FileText} />
      <span className="nom-entree">{titre}</span>
      <BoutonMenuEntree ouvert={menu !== null} ouvrir={() => setMenu('options')} libelle={`Options de la page ${titre}`} titre="Sous-page, renommer, supprimer" />
      {menu && (
        <Flottant ancre={ancre.current} fermer={() => setMenu(null)}>
          {menu === 'options' ? (
            <>
              <button className="option" onClick={() => (setMenu(null), p.sousPage(ancre.current))}>
                Nouvelle sous-page
              </button>
              <button className="option" onClick={() => (setMenu(null), setEdition(true))}>
                Renommer
              </button>
              <button className="option danger-texte" onClick={() => setMenu(p.portee())}>
                Supprimer la page…
              </button>
            </>
          ) : (
            <div className="confirmation" onClick={(e) => e.stopPropagation()}>
              <strong>Supprimer « {titre} » ?</strong>
              <p>
                {menu.sousPages > 0
                  ? `La page part avec ${menu.sousPages > 1 ? `ses ${menu.sousPages} sous-pages` : 'sa sous-page'}.`
                  : 'Le fichier de la page est supprimé.'}{' '}
                Ctrl+Z la remet.
              </p>
              {menu.citations > 0 && <p>{menu.citations > 1 ? `${menu.citations} pages ou lignes y renvoient : ces liens seront morts.` : 'Une page ou une ligne y renvoie : ce lien sera mort.'}</p>}
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

/** « Nouvelle page » : page vide, un modèle livré, ou un modèle de l'espace (`_wiki/_modeles/`). */
function ChoixModele(p: { modeles: readonly ModeleWiki[]; choisir: (modele: ModeleWiki | null) => void }) {
  const option = (m: ModeleWiki) => (
    <button key={m.id} className="option" onClick={() => p.choisir(m)}>
      <Icone de={LayoutTemplate} />
      {m.nom}
    </button>
  )
  return (
    <div className="menu-modeles-wiki" role="menu" aria-label="Nouvelle page">
      <button className="option" onClick={() => p.choisir(null)}>
        <Icone de={File} />
        Page vide
      </button>
      <div className="separateur-menu" />
      <div className="titre-menu discret">Modèles</div>
      {MODELES_WIKI_LIVRES.map(option)}
      {p.modeles.length > 0 && (
        <>
          <div className="separateur-menu" />
          <div className="titre-menu discret">Modèles de l’espace</div>
          {p.modeles.map(option)}
        </>
      )}
    </div>
  )
}
