import { useEffect, useState, useSyncExternalStore } from 'react'
import { BookOpen, Bot, Check, Copy, Inbox, RefreshCw, Sparkles } from 'lucide-react'
import type { EtatEspace } from '../core/depot-espace'
import { estBureau } from '../adapters/tauri/bureau'
import { connecterClaudeDesktop, executableMdbase } from '../adapters/tauri/mcp'
import { useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Icone } from './icones'
import { Interrupteur, Section } from './reglages'

// Modules (spec §19) : les fonctions qui ne servent pas à tout le monde
// s'activent une par une. Choix propres à cette machine (localStorage, comme la
// clé de l'assistant) ; désactiver un module cache ce qu'il montre, sans
// toucher aux fichiers. L'assistant garde son propre réglage (activation avec
// avertissement, spec §12).

export type ChoixModules = { jira?: boolean; inbox?: boolean; contexte?: boolean; mcp?: boolean }

const CLE = 'mdbase.modules'
const abonnes = new Set<() => void>()
let courant: ChoixModules | null = null

function lireChoix(): ChoixModules {
  if (courant) return courant
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Record<string, unknown> | null
    const oui = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
    courant = brut ? { jira: oui(brut.jira), inbox: oui(brut.inbox), contexte: oui(brut.contexte), mcp: oui(brut.mcp) } : {}
  } catch {
    courant = {}
  }
  return courant
}

export function changerModule(module: keyof ChoixModules, actif: boolean) {
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

const aUneBaseJira = (etat: EtatEspace) => [...etat.bases.values()].some((b) => b.depot?.schema.source !== undefined)

/** Modules actifs ; Jira l'est par défaut quand l'espace contient déjà une base Jira. */
export function useModules(etat: EtatEspace): { jira: boolean; inbox: boolean; contexte: boolean; mcp: boolean } {
  const choix = useSyncExternalStore(abonner, lireChoix)
  return { jira: choix.jira ?? aUneBaseJira(etat), inbox: choix.inbox ?? false, contexte: choix.contexte ?? false, mcp: estBureau() && (choix.mcp ?? false) }
}

/** Pour une lecture hors composant (la session de l'assistant). */
export const contexteActif = () => lireChoix().contexte ?? false

export function FenetreModules(p: { assistantActif: boolean; reglerAssistant: () => void; desactiverAssistant: () => void; ouvrirContexte: () => void; fermer: () => void }) {
  const { etat } = useEspace()
  const modules = useModules(etat)
  return (
    <Fenetre titre="Modules" fermer={p.fermer}>
      <div className="modules">
        <p className="discret">Active seulement ce qui te sert. Désactiver un module le cache, sans toucher à tes fichiers. Choix gardés sur cette machine.</p>
        <Section aide="Bases en lecture seule remplies par le script de synchro Jira : statut des tickets, rollups sur tes lignes.">
          <Interrupteur libelle="Jira" icone={RefreshCw} coche={modules.jira} changer={(v) => changerModule('jira', v)} />
        </Section>
        <Section aide="Une conversation qui lit tes bases et propose des modifications, montrées avant d’être appliquées. Demande un service d’IA et sa clé.">
          <Interrupteur libelle="Assistant IA" icone={Sparkles} coche={p.assistantActif} changer={(v) => (v ? p.reglerAssistant() : p.desactiverAssistant())} />
          {p.assistantActif && (
            <button className="discret lien-module" onClick={p.reglerAssistant}>
              Régler la connexion
            </button>
          )}
        </Section>
        <Section aide="Un endroit où tout déposer : remarques, mails, présentations, PDF. À traiter toi-même, ou à envoyer à l’assistant, ligne par ligne ou en entier.">
          <Interrupteur libelle="Inbox" icone={Inbox} coche={modules.inbox} changer={(v) => changerModule('inbox', v)} />
        </Section>
        {estBureau() && (
          <Section aide="Claude Desktop ou Claude Code lisent et modifient tes bases avec les mêmes contrôles que l’app. mdbase doit être ouverte : Claude l’ouvre si besoin. Rien d’autre ne peut s’y connecter.">
            <Interrupteur libelle="Claude (MCP)" icone={Bot} coche={modules.mcp} changer={(v) => changerModule('mcp', v)} />
            {modules.mcp && <ConnexionClaude />}
          </Section>
        )}
        <Section aide="Le texte qui explique ton organisation à l’assistant, envoyé à chaque demande, et les documents rangés depuis l’inbox, où il cherche. Ajoute l’entrée Documents dans la barre latérale.">
          <Interrupteur libelle="Contexte IA" icone={BookOpen} coche={modules.contexte && p.assistantActif} desactive={!p.assistantActif} changer={(v) => changerModule('contexte', v)} />
          {!p.assistantActif && <p className="discret aide-reglage">Demande l’assistant IA.</p>}
          {modules.contexte && p.assistantActif && (
            <button className="discret lien-module" onClick={p.ouvrirContexte}>
              Éditer le contexte
            </button>
          )}
        </Section>
      </div>
    </Fenetre>
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
