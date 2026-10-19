import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BookOpen, Bot, Check, Copy, Inbox, LayoutDashboard, ListChecks, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react'
import type { EtatEspace } from '../core/depot-espace'
import { estVueModule, usagesModules, type IdModule } from '../core/modules'
import type { TypeVue } from '../core/vue'
import { estBureau } from '../adapters/tauri/bureau'
import { connecterClaudeDesktop, executableMdbase } from '../adapters/tauri/mcp'
import { useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Icone, ICONES_VUES } from './icones'

// Magasin de modules (spec §19) : un socle toujours là, et des modules qu'on
// ajoute quand ils servent. Choix propres à cette machine (localStorage, comme
// la clé de l'assistant) ; retirer un module cache ses menus, sans toucher aux
// fichiers. Un module dont l'espace se sert reste actif, quoi qu'on ait choisi
// (`usagesModules`). L'assistant garde son propre réglage (activation avec
// avertissement, spec §12).

/** Modules réglés ici ; l'assistant est réglé à part. */
type IdChoix = Exclude<IdModule, 'assistant'>
export type ChoixModules = Partial<Record<IdChoix, boolean>>
export type ModulesActifs = Record<IdChoix, boolean>

const IDS: readonly IdChoix[] = ['kanban', 'collection', 'calendrier', 'timeline', 'taches', 'dashboards', 'inbox', 'contexte', 'jira', 'mcp']
const CLE = 'mdbase.modules'
const abonnes = new Set<() => void>()
let courant: ChoixModules | null = null

function lireChoix(): ChoixModules {
  if (courant) return courant
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Record<string, unknown> | null
    courant = Object.fromEntries(IDS.flatMap((id) => (typeof brut?.[id] === 'boolean' ? [[id, brut[id]]] : []))) as ChoixModules
  } catch {
    courant = {}
  }
  return courant
}

export function changerModule(module: IdChoix, actif: boolean) {
  courant = { ...lireChoix(), [module]: actif }
  try {
    localStorage.setItem(CLE, JSON.stringify(courant))
  } catch {
    // stockage indisponible : choix gardé pour la session seulement
  }
  for (const f of abonnes) f()
}

const abonner = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

/** Ce que l'espace utilise, recalculé quand il change. */
export const useUsages = (etat: EtatEspace) => useMemo(() => usagesModules(etat), [etat])

/** Modules actifs : ajoutés sur cette machine, ou utilisés par l'espace. */
export function useModules(etat: EtatEspace): ModulesActifs {
  const choix = useSyncExternalStore(abonner, lireChoix)
  const usages = useUsages(etat)
  const actifs = Object.fromEntries(IDS.map((id) => [id, usages[id] !== undefined || choix[id] === true])) as ModulesActifs
  return { ...actifs, mcp: estBureau() && actifs.mcp }
}

/** Pour une lecture hors composant (la session de l'assistant). */
export const contexteActif = () => lireChoix().contexte ?? false

/** Types de vue proposés à la création : le tableau, et les vues ajoutées. */
export function useTypesActifs(): (t: TypeVue) => boolean {
  const modules = useModules(useEspace().etat)
  return (t) => !estVueModule(t) || modules[t]
}

// Ouvrir le magasin depuis un menu (« Plus de vues ») : App s'y inscrit.
let ouvrirCourant: (() => void) | null = null
export function useOuvertureMagasin(ouvrir: () => void) {
  useEffect(() => {
    ouvrirCourant = ouvrir
    return () => {
      if (ouvrirCourant === ouvrir) ouvrirCourant = null
    }
  }, [ouvrir])
}
export const ouvrirMagasin = () => ouvrirCourant?.()

// ── Catalogue ───────────────────────────────────────────────────

type Fiche = { id: IdModule; nom: string; icone: LucideIcon; phrase: string; apercu: ReactNode }

const CATALOGUE: { categorie: string; fiches: Fiche[] }[] = [
  {
    categorie: 'Vues',
    fiches: [
      { id: 'kanban', nom: 'Kanban', icone: ICONES_VUES.kanban, phrase: 'Des colonnes par statut ; on glisse une carte pour changer sa valeur.', apercu: <ApercuKanban /> },
      { id: 'collection', nom: 'Collection', icone: ICONES_VUES.collection, phrase: 'Une grille de cartes, avec une image quand la ligne en a une.', apercu: <ApercuCollection /> },
      { id: 'calendrier', nom: 'Calendrier', icone: ICONES_VUES.calendrier, phrase: 'Les lignes datées sur un mois ou une semaine.', apercu: <ApercuCalendrier /> },
      { id: 'timeline', nom: 'Timeline', icone: ICONES_VUES.timeline, phrase: 'Des barres du début à la fin, pour voir ce qui se chevauche.', apercu: <ApercuTimeline /> },
    ],
  },
  {
    categorie: 'Organisation',
    fiches: [
      { id: 'taches', nom: 'Tâches', icone: ListChecks, phrase: 'Toutes les tâches de l’espace au même endroit : cases des pages et base des tâches, avec sous-tâches.', apercu: <ApercuTaches /> },
      { id: 'dashboards', nom: 'Dashboards', icone: LayoutDashboard, phrase: 'Des vues de plusieurs bases sur une page, des graphiques et des fiches calculés en SQL.', apercu: <ApercuDashboards /> },
    ],
  },
  {
    categorie: 'Assistant',
    fiches: [
      { id: 'assistant', nom: 'Assistant IA', icone: Sparkles, phrase: 'Une conversation qui lit tes bases et propose des modifications, montrées avant d’être appliquées. Demande un service d’IA et sa clé.', apercu: <ApercuAssistant /> },
      { id: 'inbox', nom: 'Inbox', icone: Inbox, phrase: 'Un endroit où tout déposer : remarques, mails, PDF. À traiter toi-même ou à envoyer à l’assistant.', apercu: <ApercuInbox /> },
      { id: 'contexte', nom: 'Contexte IA', icone: BookOpen, phrase: 'Le texte qui explique ton organisation à l’assistant, et les documents rangés depuis l’inbox, où il cherche.', apercu: <ApercuContexte /> },
    ],
  },
  {
    categorie: 'Intégrations',
    fiches: [
      { id: 'jira', nom: 'Jira', icone: RefreshCw, phrase: 'Des bases en lecture seule remplies par la synchro Jira : statut des tickets, rollups sur tes lignes.', apercu: <ApercuJira /> },
      { id: 'mcp', nom: 'Claude (MCP)', icone: Bot, phrase: 'Claude Desktop ou Claude Code lisent et modifient tes bases, avec les mêmes contrôles que l’app.', apercu: <ApercuMcp /> },
    ],
  },
]

export function FenetreModules(p: { assistantActif: boolean; reglerAssistant: () => void; desactiverAssistant: () => void; ouvrirContexte: () => void; fermer: () => void }) {
  const { etat } = useEspace()
  const modules = useModules(etat)
  const usages = useUsages(etat)
  const actif = (id: IdModule) => (id === 'assistant' ? p.assistantActif : id === 'contexte' ? modules.contexte && p.assistantActif : modules[id])
  const changer = (id: IdModule, v: boolean) => (id === 'assistant' ? (v ? p.reglerAssistant() : p.desactiverAssistant()) : changerModule(id, v))
  const empeche = (id: IdModule) => (id === 'contexte' && !p.assistantActif ? 'Demande l’assistant IA.' : undefined)
  const reglage = (id: IdModule): ReactNode =>
    id === 'assistant' && p.assistantActif ? (
      <button className="discret lien-module" onClick={p.reglerAssistant}>
        Régler la connexion
      </button>
    ) : id === 'contexte' && actif(id) ? (
      <button className="discret lien-module" onClick={p.ouvrirContexte}>
        Éditer le contexte
      </button>
    ) : id === 'mcp' && actif(id) ? (
      <ConnexionClaude />
    ) : null
  return (
    <Fenetre titre="Magasin" fermer={p.fermer}>
      <div className="magasin">
        <p className="discret">Le socle (bases, tableau, pages, relations, formules, import et export) est toujours là. Ajoute ce qui te sert : retirer un module cache ses menus, sans toucher à tes fichiers. Choix gardés sur cette machine.</p>
        {CATALOGUE.map((c) => {
          const fiches = c.fiches.filter((f) => f.id !== 'mcp' || estBureau())
          return (
            <section key={c.categorie} className="categorie-magasin">
              <h3>{c.categorie}</h3>
              <div className="fiches-magasin">
                {fiches.map((f) => (
                  <FicheModule key={f.id} fiche={f} actif={actif(f.id)} usage={usages[f.id]} empeche={empeche(f.id)} changer={(v) => changer(f.id, v)}>
                    {reglage(f.id)}
                  </FicheModule>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Fenetre>
  )
}

function FicheModule(p: { fiche: Fiche; actif: boolean; usage: string | undefined; empeche: string | undefined; changer: (v: boolean) => void; children: ReactNode }) {
  const { fiche } = p
  return (
    <article className={`fiche-module ${p.actif ? 'active' : ''}`} aria-label={fiche.nom}>
      <div className="apercu-module" aria-hidden>
        {fiche.apercu}
      </div>
      <div className="texte-module">
        <h4>
          <Icone de={fiche.icone} />
          {fiche.nom}
        </h4>
        <p>{fiche.phrase}</p>
        {p.children}
      </div>
      <div className="pied-module">
        {p.usage ? (
          <>
            <span className="usage-module">
              <Icone de={Check} taille={14} />
              {p.usage}
            </span>
            <button className="discret" disabled title="Ce module reste actif tant que l’espace s’en sert">
              Retirer
            </button>
          </>
        ) : p.actif ? (
          <>
            <span className="usage-module">
              <Icone de={Check} taille={14} />
              Ajouté
            </span>
            <button className="discret" onClick={() => p.changer(false)}>
              Retirer
            </button>
          </>
        ) : (
          <>
            <span className="discret">{p.empeche}</span>
            <button className="principal" disabled={p.empeche !== undefined} onClick={() => p.changer(true)}>
              Ajouter
            </button>
          </>
        )}
      </div>
    </article>
  )
}

// ── Aperçus : un croquis de ce que le module montre ──────────────

const Croquis = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 120 72" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    {children}
  </svg>
)
const Carte = (p: { x: number; y: number; l: number; h: number; plein?: boolean }) => <rect x={p.x} y={p.y} width={p.l} height={p.h} rx={2.5} className={p.plein ? 'plein' : 'carte'} />
const Trait = (p: { x: number; y: number; l: number }) => <rect x={p.x} y={p.y} width={p.l} height={2.5} rx={1.25} className="trait" />

function ApercuKanban() {
  return (
    <Croquis>
      {[8, 44, 80].map((x, i) => (
        <g key={x}>
          <Trait x={x} y={8} l={18} />
          {Array.from({ length: 3 - i }, (_, j) => (
            <Carte key={j} x={x} y={16 + j * 16} l={32} h={12} plein={i === 1 && j === 0} />
          ))}
        </g>
      ))}
    </Croquis>
  )
}

function ApercuCollection() {
  return (
    <Croquis>
      {[0, 1, 2].flatMap((c) =>
        [0, 1].map((r) => (
          <g key={`${c}-${r}`}>
            <Carte x={8 + c * 36} y={6 + r * 32} l={32} h={28} />
            <rect x={8 + c * 36} y={6 + r * 32} width={32} height={15} rx={2.5} className={(c + r) % 2 ? 'doux' : 'plein'} />
            <Trait x={12 + c * 36} y={26 + r * 32} l={18} />
          </g>
        )),
      )}
    </Croquis>
  )
}

function ApercuCalendrier() {
  const pleins = new Set(['1-2', '3-1', '4-3', '2-0'])
  return (
    <Croquis>
      {Array.from({ length: 7 }, (_, c) =>
        Array.from({ length: 4 }, (_, r) => (
          <g key={`${c}-${r}`}>
            <rect x={8 + c * 15} y={8 + r * 15} width={14} height={14} className="case" />
            {pleins.has(`${c}-${r}`) && <rect x={10 + c * 15} y={15 + r * 15} width={10} height={4} rx={1.5} className="plein" />}
          </g>
        )),
      )}
    </Croquis>
  )
}

function ApercuTimeline() {
  const barres = [
    [10, 40],
    [30, 50],
    [56, 34],
    [24, 28],
    [70, 40],
  ] as const
  return (
    <Croquis>
      {[30, 60, 90].map((x) => (
        <line key={x} x1={x} y1={6} x2={x} y2={66} className="grille" />
      ))}
      {barres.map(([x, l], i) => (
        <rect key={i} x={x} y={8 + i * 12} width={l} height={8} rx={3} className={i === 2 ? 'plein' : 'carte'} />
      ))}
    </Croquis>
  )
}

function ApercuTaches() {
  const lignes = [
    [8, true],
    [8, false],
    [20, false],
    [20, true],
    [8, false],
  ] as const
  return (
    <Croquis>
      {lignes.map(([x, fait], i) => (
        <g key={i}>
          <rect x={x} y={9 + i * 12} width={7} height={7} rx={1.5} className={fait ? 'plein' : 'case'} />
          <Trait x={x + 12} y={11.5 + i * 12} l={fait ? 34 : 50 - x / 2} />
        </g>
      ))}
    </Croquis>
  )
}

function ApercuDashboards() {
  return (
    <Croquis>
      <Carte x={8} y={8} l={60} h={26} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={14 + i * 10} y={28 - [10, 16, 8, 18, 13][i]!} width={6} height={[10, 16, 8, 18, 13][i]!} className={i === 3 ? 'plein' : 'doux'} />
      ))}
      <Carte x={72} y={8} l={40} h={26} />
      <Trait x={78} y={14} l={20} />
      <rect x={78} y={21} width={14} height={7} rx={1.5} className="plein" />
      <Carte x={8} y={38} l={104} h={26} />
      {[0, 1, 2].map((i) => (
        <Trait key={i} x={14} y={44 + i * 7} l={[80, 64, 72][i]!} />
      ))}
    </Croquis>
  )
}

function ApercuAssistant() {
  return (
    <Croquis>
      <rect x={8} y={8} width={64} height={16} rx={6} className="carte" />
      <Trait x={14} y={14.5} l={40} />
      <rect x={44} y={28} width={68} height={16} rx={6} className="plein" />
      <rect x={8} y={48} width={76} height={16} rx={6} className="carte" />
      <Trait x={14} y={54.5} l={54} />
    </Croquis>
  )
}

function ApercuInbox() {
  return (
    <Croquis>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Carte x={14} y={8 + i * 14} l={92} h={11} plein={i === 0} />
          {i > 0 && <Trait x={20} y={12 + i * 14} l={50 - i * 8} />}
        </g>
      ))}
      <path d="M10 50 h100 v14 h-100 z M10 50 l12 -6 h76 l12 6" className="bac" />
    </Croquis>
  )
}

function ApercuContexte() {
  return (
    <Croquis>
      <path d="M30 6 h44 l14 14 v46 h-58 z" className="carte" />
      <path d="M74 6 v14 h14" className="grille" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Trait key={i} x={36} y={26 + i * 7} l={[40, 34, 44, 28, 38][i]!} />
      ))}
    </Croquis>
  )
}

function ApercuJira() {
  return (
    <Croquis>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <Trait x={10} y={12 + i * 14} l={46} />
          <rect x={70} y={9 + i * 14} width={i % 2 ? 22 : 30} height={8} rx={4} className={i === 1 ? 'plein' : 'doux'} />
        </g>
      ))}
    </Croquis>
  )
}

function ApercuMcp() {
  return (
    <Croquis>
      <Carte x={10} y={20} l={36} h={32} />
      <Carte x={74} y={20} l={36} h={32} plein />
      <line x1={46} y1={32} x2={74} y2={32} className="lien" />
      <line x1={74} y1={40} x2={46} y2={40} className="lien" />
      <Trait x={16} y={28} l={22} />
      <Trait x={16} y={35} l={16} />
    </Croquis>
  )
}

/** Brancher mdbase dans Claude : Claude Desktop d'un clic, Claude Code par une commande à copier. */
function ConnexionClaude() {
  const [exe, setExe] = useState<string | null>(null)
  const [desktop, setDesktop] = useState<{ fait?: string[]; erreur?: string }>({})
  const [copiee, setCopiee] = useState(false)
  useEffect(() => void executableMdbase().then(setExe, () => setExe(null)), [])
  const commande = exe ? `claude mcp add -s user mdbase -- "${exe}" --mcp` : ''
  return (
    <div className="connexion-claude">
      <button
        className="discret lien-module"
        onClick={() =>
          void connecterClaudeDesktop().then(
            (fait) => setDesktop({ fait }),
            (e: unknown) => setDesktop({ erreur: String(e) }),
          )
        }
      >
        Connecter à Claude Desktop
      </button>
      {desktop.fait && <p className="discret aide-reglage">C’est fait : redémarre Claude Desktop pour qu’il voie mdbase.</p>}
      {desktop.erreur && <p className="erreur-connexion">{desktop.erreur}</p>}
      {commande && (
        <>
          <p className="discret aide-reglage">Claude Code : une fois, dans un terminal, puis relance la session.</p>
          <div className="commande">
            <code>{commande}</code>
            <button
              className="discret"
              title="Copier la commande"
              aria-label="Copier la commande de Claude Code"
              onClick={() => void navigator.clipboard.writeText(commande).then(() => setCopiee(true), () => undefined)}
            >
              <Icone de={copiee ? Check : Copy} taille={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
