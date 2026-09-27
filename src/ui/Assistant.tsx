import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowRight, ArrowUp, LoaderCircle, Settings, Sparkles, Square, SquarePen, X } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { sansReflexion } from '../core/ia/assistant'
import type { Assistant as MemoireEtSkills } from '../core/ia/memoire'
import { decrireAction } from '../core/ia/structure'
import { listerModeles } from '../adapters/ia/compatible-openai'
import type { ReglagesIA } from '../adapters/ia/reglages'
import { Fenetre } from './fenetre'
import { Icone } from './icones'
import { texteMention, type Resultat, type SessionAssistant } from './sessionAssistant'
import { useLargeurPanneau } from './useLargeurPanneau'

// Assistant IA (spec §12, « Module IA ») : désactivé par défaut, activé après
// un avertissement ; une conversation, dans un panneau à droite, où chaque
// modification proposée est montrée avant d'être appliquée.

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

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

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
const secondes = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** Hauteur maximale du champ de demande, en part de la fenêtre : au-delà, il défile. */
const HAUTEUR_DEMANDE = 0.4

/**
 * Panneau de l'assistant, à droite du contenu (Ctrl+J). Il ne fait qu'afficher
 * la session : le fermer n'arrête pas une demande en cours.
 */
export function PanneauAssistant(p: { session: SessionAssistant; baseOuverte: string | null; reglages: ReglagesIA; reglerIA: () => void; fermer: () => void }) {
  const { session } = p
  const tours = useSyncExternalStore(session.abonner, session.lire)
  const enCours = tours.some((t) => t.resultat.type === 'envoi')
  const [demande, setDemande] = useState(session.brouillon)
  const [largeur, saisirPoignee] = useLargeurPanneau('mdbase.largeurAssistant', 420)
  const [, setTic] = useState(0)
  const fil = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  /** Le fil suit la réponse tant qu'on n'est pas remonté le relire. */
  const enBas = useRef(true)
  const nombre = useRef(tours.length)

  useLayoutEffect(() => {
    const f = fil.current
    if (f && (enBas.current || tours.length !== nombre.current)) f.scrollTop = f.scrollHeight
    nombre.current = tours.length
  }, [tours])

  // Le champ grandit avec le texte, jusqu'à une hauteur au-delà de laquelle il défile.
  useLayoutEffect(() => {
    const c = champ.current
    if (!c) return
    c.style.height = 'auto'
    c.style.height = `${Math.min(c.scrollHeight + 2, window.innerHeight * HAUTEUR_DEMANDE)}px`
  }, [demande, largeur])

  // Chronomètre affiché pendant l'attente : la vitesse compte.
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => setTic((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [enCours])

  const saisir = (texte: string) => {
    setDemande(texte)
    session.brouillon = texte
  }
  const envoyer = () => {
    if (demande.trim() === '' || enCours) return
    void session.envoyer(demande, { reglages: p.reglages, baseOuverte: p.baseOuverte })
    saisir('')
    enBas.current = true
  }

  return (
    <aside className="panneau-ia" style={{ width: largeur }} aria-label="Assistant IA">
      <div className="poignee-page" onPointerDown={saisirPoignee} title="Élargir ou rétrécir" />
      <header className="entete-ia">
        <h2>Assistant IA</h2>
        <button className="discret bascule-mode" onClick={() => session.nouvelle()} disabled={enCours || tours.length === 0} title="Nouvelle conversation" aria-label="Nouvelle conversation">
          <Icone de={SquarePen} taille={16} />
        </button>
        <button className="discret bascule-mode" onClick={p.reglerIA} title="Réglages de l’assistant" aria-label="Réglages de l’assistant">
          <Icone de={Settings} taille={16} />
        </button>
        <button className="discret bascule-mode" onClick={p.fermer} title={`Fermer (${MAC ? '⌘' : 'Ctrl+'}J) : une demande en cours continue`} aria-label="Fermer l’assistant">
          <Icone de={X} taille={17} />
        </button>
      </header>

      <div
        className="fil-ia"
        ref={fil}
        onScroll={(e) => {
          const f = e.currentTarget
          enBas.current = f.scrollHeight - f.scrollTop - f.clientHeight < 40
        }}
      >
        {tours.length === 0 && <p className="discret">Demande une modification en français : l’assistant te montre ce qu’il ferait avant de toucher à quoi que ce soit.</p>}
        {tours.map((t, i) => (
          <div key={i} className="tour-ia">
            {t.demande && <div className="bulle-ia moi">{t.demande}</div>}
            <BulleReponse resultat={t.resultat} appliquer={() => void session.appliquer(i)} annuler={() => session.annulerPlan(i)} />
            {t.memoire?.map((m, k) => (
              <div key={k} className={`mention-ia discret${m.etat === 'annule' ? ' annulee' : ''}`}>
                {texteMention(m.action)}
                {m.etat === 'fait' && (
                  <>
                    {' · '}
                    <button className="lien" onClick={() => void session.annulerMemoire(i, k)}>
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
          ref={champ}
          autoFocus
          rows={1}
          value={demande}
          placeholder={tours.length === 0 ? 'Ex. : passe les tâches en retard en « Terminé »' : 'Répondre…'}
          onChange={(e) => saisir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              envoyer()
            }
          }}
        />
        <div className="pied-ia discret">
          <span className="modele-ia" title={p.reglages.modele}>
            {p.reglages.modele}
          </span>
          {enCours ? (
            <button className="arret-ia" onClick={() => session.arreter()} title="Arrêter la demande" aria-label="Arrêter">
              <Icone de={Square} taille={12} />
              Arrêter
            </button>
          ) : (
            <button className="principal envoi-ia" onClick={envoyer} disabled={demande.trim() === ''} aria-label="Envoyer" title="Envoyer (Entrée)">
              <Icone de={ArrowUp} taille={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

/** Sur le bouton de la barre latérale : une demande tourne, ou une proposition attend. */
export function IndicateurIA({ session }: { session: SessionAssistant }) {
  const activite = useSyncExternalStore(session.abonner, () => session.activite())
  if (activite === 'en-cours')
    return (
      <span className="indicateur-ia" role="status" title="Demande en cours">
        <Icone de={LoaderCircle} taille={14} className="tourne" />
      </span>
    )
  if (activite === 'a-voir') return <span className="indicateur-ia point-ia" role="status" title="Proposition à relire" />
  return null
}

function BulleReponse({ resultat: r, appliquer, annuler }: { resultat: Resultat; appliquer: () => void; annuler: () => void }) {
  if (r.type === 'envoi') {
    const texte = sansReflexion(r.progression?.texte ?? '')
    const outils = r.progression?.outils.length ?? 0
    return (
      <div className="bulle-ia">
        {texte && <p className="reponse-ia">{texte}</p>}
        <div className="etat-ia discret">
          <Icone de={Sparkles} /> {outils > 0 ? `Prépare ${pluriel(outils, 'proposition')}…` : texte ? 'Écrit…' : 'Réflexion…'} {secondes(performance.now() - r.depuis)}
        </div>
      </div>
    )
  }
  if (r.type === 'erreur') return <div className="bulle-ia erreur">{r.message}</div>
  if (r.type === 'arrete') {
    return (
      <div className="bulle-ia">
        {r.texte && <p className="reponse-ia">{r.texte}</p>}
        <div className="etat-ia discret">Arrêté</div>
      </div>
    )
  }
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
  const structure = (r.plan?.structure ?? []).map(decrireAction)
  const suite = (r.plan?.suite ?? []).map(decrireAction)
  const reglages = structure.length + suite.length
  const quoi = [reglages > 0 ? pluriel(reglages, 'action') : '', total > 0 ? pluriel(total, 'ligne') : '', skills.length > 0 ? pluriel(skills.length, 'skill') : '']
    .filter(Boolean)
    .join(' et ')
  return (
    <div className="bulle-ia plan-ia">
      {r.message && <p className="reponse-ia">{r.message}</p>}
      {structure.length > 0 && <ActionsIA titre="Structure" actions={structure} />}
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
                      {c.colonne} : {op.type === 'modifier' && (
                        <>
                          <del>{c.avant || 'vide'}</del>
                          <Icone de={ArrowRight} taille={13} />
                        </>
                      )}{' '}
                      <ins>{c.apres || 'vide'}</ins>
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
      {suite.length > 0 && <ActionsIA titre="Ensuite" actions={suite} />}
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

/** Actions de structure ou de suite du plan ; une suppression est signalée. */
function ActionsIA({ titre, actions }: { titre: string; actions: { texte: string; danger: boolean }[] }) {
  return (
    <section className="operation-ia">
      <h3>{titre}</h3>
      <ul>
        {actions.map((a, i) => (
          <li key={i} className={a.danger ? 'danger-ia' : undefined}>
            {a.texte}
          </li>
        ))}
      </ul>
    </section>
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
