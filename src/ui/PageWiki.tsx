import { createContext, lazy, Suspense, useContext, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, FileText, FolderTree } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { arbreWiki, comparerPages, parentsDe, type NoeudWiki, type PageWiki } from '../core/wiki'
import { useLancer } from './actions'
import { ContexteEspace, ContexteOuvrir, useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Icone } from './icones'
import { useConsultation } from './mode'
import type { SourceLiens } from './editeur/references'

// Page du wiki ouverte dans la zone principale (spec §22) : fil d'Ariane des
// parents, titre éditable, corps édité comme celui d'une ligne (§9), sans
// en-tête de propriétés ; en bas, ses sous-pages, puisqu'une page qui en a
// sert aussi de dossier.

// CodeMirror pèse lourd : chargé seulement à l'ouverture d'une première page.
const EditeurCorps = lazy(() => import('./EditeurCorps').then((m) => ({ default: m.EditeurCorps })))

/**
 * Crée une page vide pour « / Page » : sous `parent`, ou à l'emplacement choisi
 * dans une fenêtre (`'demander'`). `null` si l'on renonce. Fourni par l'espace
 * quand le module Wiki est actif.
 */
export type CreerPageWiki = (parent: string | null | 'demander') => Promise<PageWiki | null>
export const ContexteCreerPage = createContext<CreerPageWiki | null>(null)

/** Les liens de l'éditeur : « @ », « [[ » et « / Page », relus à chaque usage. */
export function useSourceLiens(pageEnCours?: string): SourceLiens | undefined {
  const contexte = useContext(ContexteEspace)
  const ouvrir = useContext(ContexteOuvrir)
  const creer = useContext(ContexteCreerPage)
  const courant = useRef(contexte?.etat)
  courant.current = contexte?.etat
  if (!ouvrir || !courant.current) return undefined
  return {
    etat: () => courant.current!,
    ouvrir,
    ...(creer && {
      wiki: {
        pageEnCours: pageEnCours !== undefined,
        creerPage: (demander: boolean) => creer(demander || pageEnCours === undefined ? 'demander' : pageEnCours),
      },
    }),
  }
}

export function VuePageWiki(p: { id: string; ouvrir: (id: string) => void }) {
  const { espace, etat } = useEspace()
  const { pages } = etat.wiki
  const page = pages.find((x) => x.id === p.id)
  const liens = useSourceLiens(p.id)
  const lecture = useConsultation()
  // Corps changé sur le disque (autre machine) : l'éditeur est remonté, sinon
  // il garderait l'ancien texte et le réécrirait à la frappe suivante.
  const emis = useRef(page?.corps ?? '')
  const [suivi, setSuivi] = useState({ corps: page?.corps ?? '', version: 0 })
  if (!page) return <p className="discret">Cette page n’existe plus.</p>
  if (page.corps !== suivi.corps) setSuivi({ corps: page.corps, version: suivi.version + (page.corps === emis.current ? 0 : 1) })
  const sousPages = pages.filter((x) => x.parent === page.id).sort(comparerPages)
  const parents = parentsDe(pages, page.id)
  return (
    <article className="page-wiki">
      <nav className="ariane-wiki" aria-label="Fil d’Ariane">
        <Icone de={FileText} />
        <span>Wiki</span>
        {parents.map((x) => (
          <span key={x.id} className="etape-ariane">
            <Icone de={ChevronRight} taille={12} />
            <button className="discret" onClick={() => p.ouvrir(x.id)}>
              {x.titre || 'Sans titre'}
            </button>
          </span>
        ))}
      </nav>
      <TitrePage key={page.id} espace={espace} page={page} lecture={lecture} />
      <div className="corps-page corps-wiki">
        <Suspense fallback={<div className="discret">Chargement de l'éditeur…</div>}>
          <EditeurCorps
            key={`${page.id}:${suivi.version}`}
            initial={page.corps}
            lecture={lecture}
            liens={liens}
            changer={(md) => {
              emis.current = md
              espace.modifierCorpsPageWiki(page.id, md)
            }}
          />
        </Suspense>
      </div>
      {sousPages.length > 0 && (
        <section className="bas-page-wiki">
          <h2>Sous-pages</h2>
          <ul className="sous-pages-wiki" aria-label="Sous-pages">
            {sousPages.map((x) => (
              <li key={x.id}>
                <button className="discret" onClick={() => p.ouvrir(x.id)}>
                  <Icone de={FileText} />
                  {x.titre || 'Sans titre'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function TitrePage({ espace, page, lecture }: { espace: DepotEspace; page: PageWiki; lecture: boolean }) {
  const lancer = useLancer()
  if (lecture) return <h1 className="titre-page">{page.titre || 'Sans titre'}</h1>
  return (
    <input
      className="titre-page"
      aria-label="Titre de la page"
      placeholder="Sans titre"
      value={page.titre}
      // Une page qui vient d'être créée par « / Page » attend son titre.
      autoFocus={page.titre === ''}
      onChange={(e) => espace.titrerPageWiki(page.id, e.target.value)}
      // Le fichier est renommé à la sortie du titre, jamais à chaque frappe (spec §3).
      onBlur={(e) => void lancer(espace.renommerPageWiki(page.id, e.target.value))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** « Où créer la page ? » : la racine du wiki, ou sous une page de l'arbre. */
export function FenetreEmplacement(p: { choisir: (parent: string | null) => void; fermer: () => void }) {
  const { etat } = useEspace()
  const arbre = arbreWiki(etat.wiki.pages)
  const rangee = (n: NoeudWiki, profondeur: number): ReactNode => (
    <li key={n.page.id}>
      <button className="option" style={{ paddingLeft: `${0.5 + profondeur * 1}rem` }} onClick={() => p.choisir(n.page.id)}>
        <Icone de={FileText} />
        {n.page.titre || 'Sans titre'}
      </button>
      {n.enfants.length > 0 && <ul>{n.enfants.map((e) => rangee(e, profondeur + 1))}</ul>}
    </li>
  )
  return (
    <Fenetre titre="Où créer la page ?" fermer={p.fermer}>
      <ul className="emplacements-wiki">
        <li>
          <button className="option" onClick={() => p.choisir(null)}>
            <Icone de={FolderTree} />
            À la racine du wiki
          </button>
        </li>
        {arbre.map((n) => rangee(n, 1))}
      </ul>
    </Fenetre>
  )
}

