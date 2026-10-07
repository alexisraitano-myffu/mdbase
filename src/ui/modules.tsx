import { useEffect, useState, useSyncExternalStore } from 'react'
import { BookOpen, Inbox, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import type { EtatEspace } from '../core/depot-espace'
import type { DocumentConnaissance } from '../core/ia/connaissance'
import { useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Icone } from './icones'
import { Interrupteur, Section } from './reglages'

// Modules (spec §19) : les fonctions qui ne servent pas à tout le monde
// s'activent une par une. Choix propres à cette machine (localStorage, comme la
// clé de l'assistant) ; désactiver un module cache ce qu'il montre, sans
// toucher aux fichiers. L'assistant garde son propre réglage (activation avec
// avertissement, spec §12).

export type ChoixModules = { jira?: boolean; inbox?: boolean; contexte?: boolean }

const CLE = 'mdbase.modules'
const abonnes = new Set<() => void>()
let courant: ChoixModules | null = null

function lireChoix(): ChoixModules {
  if (courant) return courant
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Record<string, unknown> | null
    const oui = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
    courant = brut ? { jira: oui(brut.jira), inbox: oui(brut.inbox), contexte: oui(brut.contexte) } : {}
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
export function useModules(etat: EtatEspace): { jira: boolean; inbox: boolean; contexte: boolean } {
  const choix = useSyncExternalStore(abonner, lireChoix)
  return { jira: choix.jira ?? aUneBaseJira(etat), inbox: choix.inbox ?? false, contexte: choix.contexte ?? false }
}

/** Pour une lecture hors composant (la session de l'assistant). */
export const contexteActif = () => lireChoix().contexte ?? false

export function FenetreModules(p: { assistantActif: boolean; reglerAssistant: () => void; desactiverAssistant: () => void; fermer: () => void }) {
  const { etat } = useEspace()
  const modules = useModules(etat)
  const [contexte, setContexte] = useState(false)
  if (contexte) return <FenetreContexte fermer={() => setContexte(false)} />
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
        <Section aide="Le texte qui explique ton organisation à l’assistant, envoyé à chaque demande, et les documents rangés depuis l’inbox, où il cherche.">
          <Interrupteur libelle="Contexte IA" icone={BookOpen} coche={modules.contexte && p.assistantActif} desactive={!p.assistantActif} changer={(v) => changerModule('contexte', v)} />
          {!p.assistantActif && <p className="discret aide-reglage">Demande l’assistant IA.</p>}
          {modules.contexte && p.assistantActif && (
            <button className="discret lien-module" onClick={() => setContexte(true)}>
              Éditer le contexte et les documents
            </button>
          )}
        </Section>
      </div>
    </Fenetre>
  )
}

/** Sections conseillées d'un contexte neuf (spec §18). */
const MODELE_CONTEXTE = `## Organisation
Ce que représente chaque base et comment elles s'emboîtent (ex. Projet → Version → Lot → Ticket).

## Propagation
Ce qui découle d'un changement (ex. un lot qui glisse décale la livraison de sa version).

## Remarques
Pour chaque base, où noter une remarque dans le corps des pages (ex. section « Remarques », une entrée datée).

## Vocabulaire, rituels, interlocuteurs
`

const TAILLE_CONSEILLEE = 8000

/** Le contexte (édité ici, jamais ouvert à la main) et les documents rangés depuis l'inbox. */
function FenetreContexte(p: { fermer: () => void }) {
  const { espace } = useEspace()
  const [texte, setTexte] = useState<string | null>(null)
  const [lu, setLu] = useState('')
  const [documents, setDocuments] = useState<DocumentConnaissance[]>([])
  const relire = () =>
    void espace.assistant.connaissance.lire().then((c) => {
      setLu(c.contexte)
      setTexte((t) => t ?? (c.contexte || MODELE_CONTEXTE))
      setDocuments(c.documents)
    })
  useEffect(relire, [espace])
  if (texte === null) return null
  const modifie = texte.trim() !== lu.trim() && !(lu === '' && texte === MODELE_CONTEXTE)
  return (
    <Fenetre titre="Contexte IA" fermer={p.fermer}>
      <div className="contexte-ia">
        <p className="discret">Envoyé à l’assistant à chaque demande : explique ton organisation une fois, il n’aura plus à la redemander.</p>
        <textarea value={texte} aria-label="Contexte" rows={16} spellCheck onChange={(e) => setTexte(e.target.value)} />
        <div className="boutons">
          <span className={`discret ${texte.length > TAILLE_CONSEILLEE ? 'erreur' : ''}`}>
            {texte.length.toLocaleString('fr-FR')} caractères{texte.length > TAILLE_CONSEILLEE ? ` : au-delà de ${TAILLE_CONSEILLEE.toLocaleString('fr-FR')}, chaque demande coûte plus cher` : ''}
          </span>
          <button className="principal" disabled={!modifie} onClick={() => void espace.assistant.connaissance.ecrireContexte(texte).then(relire)}>
            Enregistrer
          </button>
        </div>
        <div className="titre-section">Documents rangés ({documents.length})</div>
        {documents.length === 0 ? (
          <p className="discret">Aucun : les présentations et comptes rendus traités depuis l’inbox arrivent ici.</p>
        ) : (
          <ul className="documents-ia">
            {documents.map((d) => (
              <li key={d.id} className={d.remplacePar ? 'remplace' : ''}>
                <span className="element-inbox">
                  <span className="libelle-choix">{d.titre}</span>
                  <span className="discret">
                    {d.date.split('-').reverse().join('/')}
                    {d.remplacePar ? ' · remplacé' : ''}
                  </span>
                </span>
                <button className="discret" aria-label={`Supprimer le document « ${d.titre} »`} title="Supprimer ce document" onClick={() => void espace.assistant.connaissance.supprimerDocument(d.id).then(relire)}>
                  <Icone de={Trash2} taille={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Fenetre>
  )
}
