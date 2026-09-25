import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Sparkles, X } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { proposer, type Echange } from '../core/ia/assistant'
import type { Assistant as MemoireEtSkills } from '../core/ia/memoire'
import { appliquerPlan, resumerPlan, type ActionMemoire, type Plan } from '../core/ia/plan'
import { listerModeles, modeleCompatibleOpenAI } from '../adapters/ia/compatible-openai'
import { enregistrerConversation, lireConversation, type ReglagesIA, type TourGarde } from '../adapters/ia/reglages'
import { aujourdhui } from '../adapters/navigateur'
import { Fenetre } from './fenetre'
import { Icone } from './icones'

// Assistant IA (spec §12, « Module IA ») : désactivé par défaut, activé après
// un avertissement ; une conversation où chaque modification proposée est
// montrée avant d'être appliquée.

/** Services préréglés : un clic remplit l'adresse. Aucun n'est imposé (spec §12). */
const SERVICES = [
  { nom: 'OVH (Europe)', adresse: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1' },
  { nom: 'Mistral (Europe)', adresse: 'https://api.mistral.ai/v1' },
  { nom: 'Ollama (local)', adresse: 'http://localhost:11434/v1' },
  { nom: 'LM Studio (local)', adresse: 'http://localhost:1234/v1' },
]

/** Activation et réglages : l'avertissement est toujours affiché avant d'activer. `enregistrer` ferme la fenêtre. */
export function FenetreReglagesIA(p: { espace: DepotEspace; reglages: ReglagesIA; enregistrer: (r: ReglagesIA) => void; fermer: () => void }) {
  const [r, setR] = useState(p.reglages)
  const [modeles, setModeles] = useState<string[]>([])
  // Liste des modèles demandée au service dès que l'adresse (ou la clé) change.
  useEffect(() => {
    if (!/^https?:\/\/.+/.test(r.adresse.trim())) return setModeles([])
    let actuel = true
    const t = setTimeout(() => void listerModeles(r).then((m) => actuel && setModeles(m)), 400)
    return () => {
      actuel = false
      clearTimeout(t)
    }
  }, [r.adresse, r.cle])
  const champ = (cle: 'adresse' | 'cle' | 'modele', libelle: string, aide: string, type = 'text', liste?: string) => (
    <label className="champ-ia">
      <span>{libelle}</span>
      <input type={type} value={r[cle]} onChange={(e) => setR({ ...r, [cle]: e.target.value })} placeholder={aide} autoComplete="off" spellCheck={false} list={liste} />
    </label>
  )
  const complet = r.adresse.trim() !== '' && r.modele.trim() !== ''
  return (
    <Fenetre titre="Assistant IA" fermer={p.fermer}>
      <div className="reglages-ia">
        <div className="avertissement-ia">
          <p>
            <strong>À chaque demande, l’assistant envoie au service choisi ci-dessous</strong> : ta demande, la structure des bases de ce dossier (noms,
            colonnes, options), des lignes (titres et valeurs, pas le contenu des pages), la mémoire et les skills de l’assistant, et les derniers
            échanges de la conversation.
          </p>
          <p>
            Aucune donnée n’est envoyée tant qu’il n’est pas activé (la liste des modèles est seulement demandée au service). Il ne peut modifier que ce dossier, et chaque modification t’est montrée avant d’être
            appliquée. La clé reste dans ce navigateur. Choisis un service dont la politique de données te convient (sans conservation, hébergé en
            Europe, ou local).
          </p>
        </div>
        <div className="services-ia">
          {SERVICES.map((sv) => (
            <button key={sv.nom} className={`pilule${r.adresse === sv.adresse ? ' active' : ''}`} onClick={() => setR({ ...r, adresse: sv.adresse })}>
              {sv.nom}
            </button>
          ))}
        </div>
        {champ('adresse', 'Adresse du service', 'https://…/v1 (compatible OpenAI)')}
        {champ('cle', 'Clé d’API', 'vide pour un serveur local', 'password')}
        {champ('modele', 'Modèle', modeles.length > 0 ? `choisir parmi ${modeles.length} modèles` : 'nom du modèle', 'text', 'modeles-ia')}
        <datalist id="modeles-ia">
          {modeles.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="discret note-ia">Gardés dans ce navigateur : à remplir une seule fois.</p>
        <MemoireEtSkillsIA espace={p.espace} />
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

type Resultat =
  | { type: 'envoi'; depuis: number }
  | { type: 'reponse'; texte: string; duree?: number }
  | {
      type: 'plan'
      /** `null` pour un plan relu d'une session précédente : il n'est plus proposé à l'application. */
      plan: Plan | null
      resume: string
      message: string
      statut: 'attente' | 'application' | 'applique' | 'annule'
      duree?: number
    }
  | { type: 'erreur'; message: string }

/** Fait retenu ou oublié pendant un tour : écrit aussitôt, annulable dans la session ; `garde` = relu d'une session précédente. */
type MentionMemoire = { action: ActionMemoire; etat: 'fait' | 'annule' | 'garde' }

type Tour = { demande: string; resultat: Resultat; memoire?: MentionMemoire[] }

const texteMention = (a: ActionMemoire) => `${a.type === 'retenir' ? 'Retenu' : 'Oublié'} : ${a.fait}`
const mentionsFaites = (t: Tour) => (t.memoire ?? []).filter((m) => m.etat !== 'annule').map((m) => texteMention(m.action))

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
const secondes = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** Ce que le modèle relit d'un tour passé, mentions de mémoire comprises. */
function echange(t: Tour): Echange | null {
  const e = echangeSansMemoire(t)
  const mentions = mentionsFaites(t)
  return e && mentions.length > 0 ? { ...e, reponse: [e.reponse, ...mentions].filter(Boolean).join('\n') } : e
}

function echangeSansMemoire(t: Tour): Echange | null {
  const r = t.resultat
  switch (r.type) {
    case 'envoi':
      return null
    case 'reponse':
      return { demande: t.demande, reponse: r.texte }
    case 'erreur':
      return { demande: t.demande, reponse: `Erreur : ${r.message}` }
    case 'plan': {
      const suite = r.statut === 'applique' ? 'Appliqué.' : r.statut === 'annule' ? 'Annulé par l’utilisateur.' : 'Pas appliqué.'
      return { demande: t.demande, reponse: `${r.message ? `${r.message}\n` : ''}Proposé :\n${r.resume}\n${suite}` }
    }
  }
}

function versGarde(t: Tour): TourGarde | null {
  const r = t.resultat
  if (r.type === 'envoi') return null
  const mentions = mentionsFaites(t)
  const memoire = mentions.length > 0 ? { memoire: mentions } : {}
  if (r.type === 'reponse') return { demande: t.demande, type: 'reponse', texte: r.texte, ...memoire }
  if (r.type === 'erreur') return { demande: t.demande, type: 'erreur', texte: r.message }
  return { demande: t.demande, type: 'plan', texte: r.resume, statut: r.statut === 'applique' ? 'applique' : 'annule', ...memoire }
}

function depuisGarde(g: TourGarde): Tour {
  // Une mention relue n'est plus annulable : elle n'est gardée que comme texte.
  const memoire = (g.memoire ?? []).map((texte): MentionMemoire => {
    const [type, ...reste] = texte.split(' : ')
    return { action: { type: type === 'Oublié' ? 'oublier' : 'retenir', fait: reste.join(' : ') }, etat: 'garde' }
  })
  if (g.type === 'reponse') return { demande: g.demande, resultat: { type: 'reponse', texte: g.texte }, memoire }
  if (g.type === 'erreur') return { demande: g.demande, resultat: { type: 'erreur', message: g.texte } }
  return { demande: g.demande, resultat: { type: 'plan', plan: null, resume: g.texte, message: '', statut: g.statut ?? 'annule' }, memoire }
}

/**
 * Conversation avec l'assistant : chaque demande relit les derniers échanges,
 * si bien qu'on peut répondre à une question du modèle. Gardée par dossier
 * dans le navigateur ; un plan n'est applicable que dans la session qui l'a reçu.
 */
export function Assistant(p: { espace: DepotEspace; dossier: string; baseOuverte: string | null; reglages: ReglagesIA; reglerIA: () => void; fermer: () => void }) {
  const [demande, setDemande] = useState('')
  const [tours, setTours] = useState<Tour[]>(() => lireConversation(p.dossier).map(depuisGarde))
  const [, setTic] = useState(0)
  const fil = useRef<HTMLDivElement>(null)
  const enCours = tours.some((t) => t.resultat.type === 'envoi')

  useEffect(() => {
    enregistrerConversation(p.dossier, tours.flatMap((t) => versGarde(t) ?? []))
    fil.current?.scrollTo({ top: fil.current.scrollHeight })
  }, [tours, p.dossier])

  // Chronomètre affiché pendant l'attente : la vitesse compte.
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => setTic((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [enCours])

  const remplacer = (i: number, resultat: Resultat) => setTours((ts) => ts.map((t, j) => (j === i ? { ...t, resultat } : t)))

  const envoyer = async () => {
    const texte = demande.trim()
    if (texte === '' || enCours) return
    // Une proposition restée sans réponse est abandonnée par la nouvelle demande.
    const passes = tours.map((t): Tour => (t.resultat.type === 'plan' && t.resultat.statut === 'attente' ? { ...t, resultat: { ...t.resultat, statut: 'annule' } } : t))
    const i = passes.length
    const depuis = performance.now()
    setTours([...passes, { demande: texte, resultat: { type: 'envoi', depuis } }])
    setDemande('')
    try {
      const historique = passes.flatMap((t) => echange(t) ?? [])
      const r = await proposer(modeleCompatibleOpenAI(p.reglages), p.espace, texte, { aujourdhui: aujourdhui(), baseOuverte: p.baseOuverte, historique })
      const duree = performance.now() - depuis
      // Mémoire : écrite aussitôt, sans confirmation, avec une mention annulable (spec §12).
      for (const a of r.memoire) await (a.type === 'retenir' ? p.espace.assistant.retenir(a.fait) : p.espace.assistant.oublier(a.fait))
      const memoire = r.memoire.map((action): MentionMemoire => ({ action, etat: 'fait' }))
      setTours((ts) =>
        ts.map((t, j): Tour =>
          j !== i
            ? t
            : {
                ...t,
                memoire,
                resultat:
                  r.type === 'plan'
                    ? { type: 'plan', plan: r.plan, resume: resumerPlan(r.plan), message: r.message, statut: 'attente', duree }
                    : { type: 'reponse', texte: r.texte, duree },
              },
        ),
      )
    } catch (e) {
      remplacer(i, { type: 'erreur', message: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Annule un fait retenu ou oublié : l'action inverse est écrite. */
  const annulerMemoire = async (i: number, k: number) => {
    const m = tours[i]?.memoire?.[k]
    if (!m || m.etat !== 'fait') return
    await (m.action.type === 'retenir' ? p.espace.assistant.oublier(m.action.fait) : p.espace.assistant.retenir(m.action.fait))
    setTours((ts) => ts.map((t, j) => (j === i ? { ...t, memoire: t.memoire?.map((x, l) => (l === k ? { ...x, etat: 'annule' } : x)) } : t)))
  }

  const appliquer = async (i: number) => {
    const r = tours[i]?.resultat
    if (r?.type !== 'plan' || !r.plan) return
    remplacer(i, { ...r, statut: 'application' })
    try {
      await appliquerPlan(p.espace, r.plan)
      remplacer(i, { ...r, statut: 'applique' })
    } catch (e) {
      remplacer(i, { ...r, statut: 'annule' })
      setTours((ts) => [...ts, { demande: '', resultat: { type: 'erreur', message: e instanceof Error ? e.message : String(e) } }])
    }
  }

  return (
    <Fenetre titre="Assistant IA" fermer={p.fermer}>
      <div className="assistant-ia">
        <div className="fil-ia" ref={fil}>
          {tours.length === 0 && <p className="discret">Demande une modification en français : l’assistant te montre ce qu’il ferait avant de toucher à quoi que ce soit.</p>}
          {tours.map((t, i) => (
            <div key={i} className="tour-ia">
              {t.demande && <div className="bulle-ia moi">{t.demande}</div>}
              <BulleReponse resultat={t.resultat} appliquer={() => void appliquer(i)} annuler={() => t.resultat.type === 'plan' && remplacer(i, { ...t.resultat, statut: 'annule' })} />
              {t.memoire?.map((m, k) => (
                <div key={k} className={`mention-ia discret${m.etat === 'annule' ? ' annulee' : ''}`}>
                  {texteMention(m.action)}
                  {m.etat === 'fait' && (
                    <>
                      {' · '}
                      <button className="lien" onClick={() => void annulerMemoire(i, k)}>
                        Annuler
                      </button>
                    </>
                  )}
                  {m.etat === 'annule' && ' · annulé'}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="demande-ia">
          <textarea
            autoFocus
            rows={2}
            value={demande}
            placeholder={tours.length === 0 ? 'Ex. : passe les tâches en retard en « Terminé »' : 'Répondre…'}
            onChange={(e) => setDemande(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void envoyer()
              }
            }}
          />
          <button className="principal" onClick={() => void envoyer()} disabled={demande.trim() === '' || enCours} aria-label="Envoyer">
            <Icone de={ArrowRight} />
          </button>
        </div>

        <div className="pied-ia discret">
          <span>
            {p.reglages.modele} ·{' '}
            <button className="lien" onClick={p.reglerIA}>
              Réglages
            </button>
          </span>
          {tours.length > 0 && !enCours && (
            <button className="lien" onClick={() => setTours([])}>
              Nouvelle conversation
            </button>
          )}
        </div>
      </div>
    </Fenetre>
  )
}

function BulleReponse({ resultat: r, appliquer, annuler }: { resultat: Resultat; appliquer: () => void; annuler: () => void }) {
  if (r.type === 'envoi') {
    return (
      <div className="bulle-ia etat-ia discret">
        <Icone de={Sparkles} /> Réflexion… {secondes(performance.now() - r.depuis)}
      </div>
    )
  }
  if (r.type === 'erreur') return <div className="bulle-ia erreur">{r.message}</div>
  const duree = r.duree !== undefined && <div className="duree-ia discret">{secondes(r.duree)}</div>
  if (r.type === 'reponse') {
    if (!r.texte) return null
    return (
      <div className="bulle-ia">
        <p className="reponse-ia">{r.texte}</p>
        {duree}
      </div>
    )
  }
  const total = r.plan?.operations.reduce((n, o) => n + o.lignes.length, 0) ?? 0
  const skills = r.plan?.skills ?? []
  const quoi = [total > 0 ? pluriel(total, 'ligne') : '', skills.length > 0 ? pluriel(skills.length, 'skill') : ''].filter(Boolean).join(' et ')
  return (
    <div className="bulle-ia plan-ia">
      {r.message && <p className="reponse-ia">{r.message}</p>}
      {r.plan ? (
        r.plan.operations.map((op, i) => (
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
        ))
      ) : (
        <p className="reponse-ia discret">{r.resume}</p>
      )}
      {skills.map((sk, i) => (
        <section key={`skill${i}`} className="operation-ia skill-ia">
          <h3>
            {sk.remplace ? 'Remplacer le skill' : 'Nouveau skill'} « {sk.nom} »
          </h3>
          <p className="discret">{sk.description}</p>
          <pre>{sk.instructions}</pre>
        </section>
      ))}
      <div className="statut-plan-ia">
        {duree}
        {r.statut === 'attente' && r.plan && (
          <div className="boutons">
            <button className="discret" onClick={annuler}>
              Annuler
            </button>
            <button className="principal" onClick={appliquer}>
              Appliquer ({quoi})
            </button>
          </div>
        )}
        {r.statut === 'application' && <span className="discret">Application…</span>}
        {r.statut === 'applique' && <span className="applique-ia">Appliqué</span>}
        {(r.statut === 'annule' || (r.statut === 'attente' && !r.plan)) && <span className="discret">Non appliqué</span>}
      </div>
    </div>
  )
}

/** Ce que l'assistant a retenu et ses skills, lus dans `_assistant/` : on peut en retirer. */
function MemoireEtSkillsIA({ espace }: { espace: DepotEspace }) {
  const [contenu, setContenu] = useState<MemoireEtSkills | null>(null)
  const relire = () => void espace.assistant.lire().then(setContenu, () => setContenu(null))
  useEffect(relire, [espace])
  if (!contenu || (contenu.memoire.length === 0 && contenu.skills.length === 0)) return null
  const retirer = (action: Promise<void>) => void action.then(relire)
  return (
    <div className="memoire-ia">
      {contenu.memoire.length > 0 && (
        <section>
          <h3>Mémoire</h3>
          <ul>
            {contenu.memoire.map((f) => (
              <li key={f}>
                {f}
                <button className="discret" aria-label={`Oublier « ${f} »`} onClick={() => retirer(espace.assistant.oublier(f))}>
                  <Icone de={X} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {contenu.skills.length > 0 && (
        <section>
          <h3>Skills</h3>
          <ul>
            {contenu.skills.map((sk) => (
              <li key={sk.nom} title={sk.instructions}>
                <span>
                  <strong>{sk.nom}</strong> <span className="discret">{sk.description}</span>
                </span>
                <button className="discret" aria-label={`Supprimer le skill « ${sk.nom} »`} onClick={() => retirer(espace.assistant.supprimerSkill(sk.nom))}>
                  <Icone de={X} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
