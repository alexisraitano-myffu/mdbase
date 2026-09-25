import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { proposer, type Proposition } from '../core/ia/assistant'
import { appliquerPlan } from '../core/ia/plan'
import { modeleCompatibleOpenAI } from '../adapters/ia/compatible-openai'
import type { ReglagesIA } from '../adapters/ia/reglages'
import { aujourdhui } from '../adapters/navigateur'
import { Fenetre } from './fenetre'
import { Icone } from './icones'

// Assistant IA (spec §12, « Module IA ») : désactivé par défaut, activé après
// un avertissement ; chaque modification proposée est montrée avant d'être appliquée.

/** Activation et réglages : l'avertissement est toujours affiché avant d'activer. `enregistrer` ferme la fenêtre. */
export function FenetreReglagesIA(p: { reglages: ReglagesIA; enregistrer: (r: ReglagesIA) => void; fermer: () => void }) {
  const [r, setR] = useState(p.reglages)
  const champ = (cle: 'adresse' | 'cle' | 'modele', libelle: string, aide: string, type = 'text') => (
    <label className="champ-ia">
      <span>{libelle}</span>
      <input type={type} value={r[cle]} onChange={(e) => setR({ ...r, [cle]: e.target.value })} placeholder={aide} autoComplete="off" spellCheck={false} />
    </label>
  )
  const complet = r.adresse.trim() !== '' && r.modele.trim() !== ''
  return (
    <Fenetre titre="Assistant IA" fermer={p.fermer}>
      <div className="reglages-ia">
        <div className="avertissement-ia">
          <p>
            <strong>À chaque demande, l’assistant envoie au service choisi ci-dessous</strong> : ta demande, la structure des bases de ce dossier (noms,
            colonnes, options) et des lignes (titres et valeurs, pas le contenu des pages).
          </p>
          <p>
            Rien n’est envoyé tant qu’il n’est pas activé. Il ne peut modifier que ce dossier, et chaque modification t’est montrée avant d’être
            appliquée. La clé reste dans ce navigateur. Choisis un service dont la politique de données te convient (sans conservation, hébergé en
            Europe, ou local).
          </p>
        </div>
        {champ('adresse', 'Adresse du service', 'https://…/v1 (compatible OpenAI)')}
        {champ('cle', 'Clé d’API', 'vide pour un serveur local', 'password')}
        {champ('modele', 'Modèle', 'nom exact du modèle')}
        <div className="boutons">
          {p.reglages.actif && (
            <button
              className="discret"
              onClick={() => p.enregistrer({ ...r, actif: false })}
            >
              Désactiver
            </button>
          )}
          <button
            className="principal"
            disabled={!complet}
            onClick={() => p.enregistrer({ ...r, actif: true })}
          >
            {p.reglages.actif ? 'Enregistrer' : 'J’ai compris, activer'}
          </button>
        </div>
      </div>
    </Fenetre>
  )
}

type Etape =
  | { type: 'saisie' }
  | { type: 'envoi'; depuis: number }
  | { type: 'proposition'; proposition: Proposition; duree: number }
  | { type: 'erreur'; message: string }
  | { type: 'application' }

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
const secondes = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

export function Assistant(p: { espace: DepotEspace; baseOuverte: string | null; reglages: ReglagesIA; reglerIA: () => void; fermer: () => void }) {
  const [demande, setDemande] = useState('')
  const [etape, setEtape] = useState<Etape>({ type: 'saisie' })
  const [, setTic] = useState(0)
  const jeton = useRef(0)

  // Chronomètre affiché pendant l'attente : la vitesse compte.
  useEffect(() => {
    if (etape.type !== 'envoi') return
    const t = setInterval(() => setTic((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [etape.type])

  const envoyer = async () => {
    if (demande.trim() === '' || etape.type === 'envoi') return
    const moi = ++jeton.current
    const depuis = performance.now()
    setEtape({ type: 'envoi', depuis })
    try {
      const proposition = await proposer(modeleCompatibleOpenAI(p.reglages), p.espace, demande.trim(), { aujourdhui: aujourdhui(), baseOuverte: p.baseOuverte })
      if (moi === jeton.current) setEtape({ type: 'proposition', proposition, duree: performance.now() - depuis })
    } catch (e) {
      if (moi === jeton.current) setEtape({ type: 'erreur', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const appliquer = async (proposition: Proposition) => {
    if (proposition.type !== 'plan') return
    setEtape({ type: 'application' })
    try {
      await appliquerPlan(p.espace, proposition.plan)
      p.fermer()
    } catch (e) {
      setEtape({ type: 'erreur', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const proposition = etape.type === 'proposition' ? etape.proposition : null
  const total = proposition?.type === 'plan' ? proposition.plan.operations.reduce((n, o) => n + o.lignes.length, 0) : 0

  return (
    <Fenetre titre="Assistant IA" fermer={p.fermer}>
      <div className="assistant-ia">
        <div className="demande-ia">
          <textarea
            autoFocus
            rows={2}
            value={demande}
            placeholder="Ex. : passe les tâches en retard en « Terminé »"
            onChange={(e) => setDemande(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void envoyer()
              }
            }}
          />
          <button className="principal" onClick={() => void envoyer()} disabled={demande.trim() === '' || etape.type === 'envoi'} aria-label="Envoyer">
            <Icone de={ArrowRight} />
          </button>
        </div>

        {etape.type === 'envoi' && (
          <p className="discret etat-ia">
            <Icone de={Sparkles} /> Réflexion… {secondes(performance.now() - etape.depuis)}
          </p>
        )}
        {etape.type === 'erreur' && <p className="erreur">{etape.message}</p>}
        {proposition?.type === 'reponse' && <p className="reponse-ia">{proposition.texte}</p>}
        {proposition?.type === 'plan' && (
          <div className="plan-ia">
            {proposition.message && <p className="reponse-ia">{proposition.message}</p>}
            {proposition.plan.operations.map((op, i) => (
              <section key={i} className="operation-ia">
                <h3>
                  {op.type === 'creer' ? 'Créer' : 'Modifier'} {pluriel(op.lignes.length, 'ligne')} · {op.nomBase}
                </h3>
                <ul>
                  {op.lignes.map((l, j) => (
                    <li key={j}>
                      <span className="titre-ia">{l.titre}</span>
                      {l.changements.map((c, k) => (
                        <span key={k} className="changement-ia">
                          {c.colonne} : {op.type === 'modifier' && <del>{c.avant || 'vide'}</del>} {op.type === 'modifier' && '→'} <ins>{c.apres || 'vide'}</ins>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="pied-ia">
          <span className="discret">
            {etape.type === 'proposition' ? `Proposé en ${secondes(etape.duree)} · ` : ''}
            {p.reglages.modele}{' '}
            <button className="lien" onClick={p.reglerIA}>
              Réglages
            </button>
          </span>
          {proposition?.type === 'plan' && (
            <div className="boutons">
              <button className="discret" onClick={() => setEtape({ type: 'saisie' })}>
                Annuler
              </button>
              <button className="principal" onClick={() => void appliquer(proposition)}>
                Appliquer ({pluriel(total, 'ligne')})
              </button>
            </div>
          )}
          {etape.type === 'application' && <span className="discret">Application…</span>}
        </div>
      </div>
    </Fenetre>
  )
}
