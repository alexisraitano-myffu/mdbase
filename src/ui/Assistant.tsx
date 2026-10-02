import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  History,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  SquarePen,
  Table2,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { sansReflexion } from '../core/ia/assistant'
import type { Assistant as MemoireEtSkills, Skill } from '../core/ia/memoire'
import { decrireAction } from '../core/ia/structure'
import { listerModeles } from '../adapters/ia/compatible-openai'
import type { ReglagesIA } from '../adapters/ia/reglages'
import { Fenetre } from './fenetre'
import { Icone } from './icones'
import { Choix } from './Choix'
import { useEspace } from './contexte-espace'
import { Flottant } from './flottant'
import { ContenuMarkdown } from './Markdown'
import { texteMention, type Demande, type Resultat, type SessionAssistant } from './sessionAssistant'
import { useLargeurPanneau } from './useLargeurPanneau'

// Assistant IA (spec §12, « Module IA ») : désactivé par défaut, activé après
// un avertissement ; une conversation, dans un panneau à droite, où chaque
// modification proposée est montrée avant d'être appliquée.

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** Services préréglés : un clic remplit l'adresse. Aucun n'est imposé (spec §12). */
/**
 * Services préremplis : un clic remplit l'adresse et un modèle par défaut, il
 * ne reste qu'à coller la clé. Haiku est celui que le banc de l'assistant mesure.
 */
const SERVICES: { nom: string; adresse: string; modele: string; cle?: string; pageCle?: string }[] = [
  { nom: 'Anthropic', adresse: 'https://api.anthropic.com/v1', modele: 'claude-haiku-4-5', cle: 'sk-ant-…', pageCle: 'https://console.anthropic.com/settings/keys' },
  { nom: 'Google Gemini', adresse: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-3.6-flash', pageCle: 'https://aistudio.google.com/apikey' },
  { nom: 'OpenAI', adresse: 'https://api.openai.com/v1', modele: 'gpt-5-mini', cle: 'sk-…', pageCle: 'https://platform.openai.com/api-keys' },
  { nom: 'Mistral (Europe)', adresse: 'https://api.mistral.ai/v1', modele: 'mistral-small-latest', pageCle: 'https://console.mistral.ai/api-keys' },
  { nom: 'OVH (Europe)', adresse: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', modele: 'Qwen3.8-27B' },
  { nom: 'Ollama (local)', adresse: 'http://localhost:11434/v1', modele: '' },
  { nom: 'LM Studio (local)', adresse: 'http://localhost:1234/v1', modele: '' },
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
  const service = SERVICES.find((sv) => sv.adresse === r.adresse.trim())
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
            <button
              key={sv.nom}
              className={`pilule${r.adresse === sv.adresse ? ' active' : ''}`}
              // Changer de service vide la clé : celle d'un autre service y serait refusée.
              onClick={() => setR({ ...r, adresse: sv.adresse, modele: sv.modele, cle: r.adresse === sv.adresse ? r.cle : '' })}
            >
              {sv.nom}
            </button>
          ))}
        </div>
        {champ('adresse', 'Adresse du service', 'https://…/v1 (compatible OpenAI)')}
        {champ('cle', 'Clé d’API', service?.cle ?? (r.adresse.includes('://localhost') ? 'vide pour un serveur local' : 'colle ta clé ici'), 'password')}
        {service?.pageCle && (
          <a className="lien-cle-ia" href={service.pageCle} target="_blank" rel="noopener noreferrer">
            <Icone de={ExternalLink} />
            Créer une clé {service.nom}
          </a>
        )}
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
const plier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Hauteur maximale du champ de demande, en part de la fenêtre : au-delà, il défile. */
const HAUTEUR_DEMANDE = 0.4
/** Suggestions montrées à la fois sous `@` ou `/`. */
const SUGGESTIONS_MAX = 8

/** Mot en cours de saisie qui appelle une liste : `@` cite une base (partout), `/` choisit un skill (en tête de demande). */
type Declencheur = { type: 'base' | 'skill'; debut: number; filtre: string }

function declencheurAu(texte: string, curseur: number): Declencheur | null {
  const avant = texte.slice(0, curseur)
  const base = /(^|\s)@([^\s@]*)$/.exec(avant)
  if (base) return { type: 'base', debut: curseur - base[2]!.length - 1, filtre: base[2]! }
  const skill = /^\/([^\n]*)$/.exec(avant)
  if (skill) return { type: 'skill', debut: 0, filtre: skill[1]! }
  return null
}

/** Ce que « Copier » met dans le presse-papiers pour une réponse. */
function texteACopier(r: Resultat): string {
  switch (r.type) {
    case 'reponse':
    case 'arrete':
      return r.texte
    case 'erreur':
      return r.message
    case 'plan':
      return [r.message, r.resume].filter(Boolean).join('\n\n')
    case 'envoi':
      return ''
  }
}

const dateCourte = (ms: number) =>
  ms > 0 ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ') : ''

/**
 * Panneau de l'assistant, à droite du contenu (Ctrl+J). Il ne fait qu'afficher
 * la session : le fermer n'arrête pas une demande en cours.
 */
export function PanneauAssistant(p: {
  session: SessionAssistant
  baseOuverte: string | null
  reglages: ReglagesIA
  reglerIA: () => void
  changerModele: (modele: string) => void
  fermer: () => void
}) {
  const { session } = p
  const { espace, etat } = useEspace()
  const tours = useSyncExternalStore(session.abonner, session.lire)
  const enCours = tours.some((t) => t.resultat.type === 'envoi')
  const [demande, setDemande] = useState<Demande>(session.brouillon)
  const [declencheur, setDeclencheur] = useState<Declencheur | null>(null)
  const [choisie, setChoisie] = useState(0)
  const [skills, setSkills] = useState<Skill[]>([])
  const [modeles, setModeles] = useState<string[]>([])
  const [copie, setCopie] = useState<number | null>(null)
  const [historique, setHistorique] = useState(false)
  const boutonHistorique = useRef<HTMLButtonElement>(null)
  const [largeur, saisirPoignee] = useLargeurPanneau('mdbase.largeurAssistant', 420)
  const [, setTic] = useState(0)
  const fil = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLTextAreaElement>(null)
  /** Le fil suit la réponse tant qu'on n'est pas remonté le relire. */
  const enBas = useRef(true)
  const nombre = useRef(tours.length)

  const bases = useMemo(
    () => [...etat.bases.values()].flatMap((b) => (b.depot ? [{ id: b.id, nom: b.depot.schema.nom }] : [])).sort((a, b) => a.nom.localeCompare(b.nom)),
    [etat],
  )
  const nomBase = (id: string) => bases.find((b) => b.id === id)?.nom ?? id

  // Skills relus à chaque ouverture du panneau (ils changent quand l'assistant en crée un).
  useEffect(() => void espace.assistant.lire().then((a) => setSkills(a.skills), () => setSkills([])), [espace, tours.length])
  // Modèles proposés par le service, pour en changer sans passer par les réglages.
  useEffect(() => {
    let actuel = true
    void listerModeles(p.reglages).then((m) => actuel && setModeles(m))
    return () => {
      actuel = false
    }
  }, [p.reglages])

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
  }, [demande.texte, largeur])

  // Chronomètre affiché pendant l'attente : la vitesse compte.
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => setTic((x) => x + 1), 100)
    return () => clearInterval(t)
  }, [enCours])

  const suggestions = useMemo(() => {
    if (!declencheur) return []
    const f = plier(declencheur.filtre)
    if (declencheur.type === 'base') {
      return bases
        .filter((b) => !demande.bases.includes(b.id) && (plier(b.nom).includes(f) || b.id.includes(f)))
        .slice(0, SUGGESTIONS_MAX)
        .map((b) => ({ valeur: b.id, libelle: b.nom, detail: '' }))
    }
    return skills
      .filter((s) => plier(s.nom).includes(f))
      .slice(0, SUGGESTIONS_MAX)
      .map((s) => ({ valeur: s.nom, libelle: s.nom, detail: s.description }))
  }, [declencheur, bases, skills, demande.bases])

  const changer = (d: Demande) => {
    setDemande(d)
    session.brouillon = d
  }
  const suivreCurseur = (texte: string, curseur: number) => {
    const d = declencheurAu(texte, curseur)
    setDeclencheur(d)
    if (d?.type !== declencheur?.type || d?.debut !== declencheur?.debut) setChoisie(0)
  }
  /** Curseur à poser après une citation : dans la même mise à jour que le texte, avant la frappe suivante. */
  const curseur = useRef<number | null>(null)
  const placerCurseur = (position: number) => {
    curseur.current = position
  }
  useLayoutEffect(() => {
    const c = champ.current
    if (curseur.current === null || !c) return
    c.focus()
    c.setSelectionRange(curseur.current, curseur.current)
    curseur.current = null
  }, [demande])

  const choisir = (valeur: string) => {
    const d = declencheur
    const c = champ.current
    if (!d || !c) return
    const apres = demande.texte.slice(c.selectionStart)
    if (d.type === 'base') {
      changer({ ...demande, texte: demande.texte.slice(0, d.debut) + apres.replace(/^ /, ''), bases: [...demande.bases, valeur] })
      placerCurseur(d.debut)
    } else {
      changer({ ...demande, texte: apres.trimStart(), skill: valeur })
      placerCurseur(0)
    }
    setDeclencheur(null)
  }

  const envoyer = () => {
    if ((demande.texte.trim() === '' && !demande.skill) || enCours) return
    void session.envoyer(demande, { reglages: p.reglages, baseOuverte: p.baseOuverte })
    changer({ texte: '', bases: [] })
    setDeclencheur(null)
    enBas.current = true
  }

  const modifier = () => {
    const d = session.reprendreDernier()
    if (!d) return
    changer(d)
    placerCurseur(d.texte.length)
  }

  const copier = (i: number, texte: string) =>
    void navigator.clipboard.writeText(texte).then(() => {
      setCopie(i)
      setTimeout(() => setCopie((c) => (c === i ? null : c)), 1500)
    })

  const dernierModifiable = !enCours && session.dernierModifiable()
  const entreesModeles = [...new Set([p.reglages.modele, ...modeles])].map((m) => ({ valeur: m, libelle: m }))
  const vide = demande.texte.trim() === '' && !demande.skill

  return (
    <aside className="panneau-ia" style={{ width: largeur }} aria-label="Assistant IA">
      <div className="poignee-page" onPointerDown={saisirPoignee} title="Élargir ou rétrécir" />
      <header className="entete-ia">
        <h2>Assistant IA</h2>
        <button
          ref={boutonHistorique}
          className="discret bascule-mode"
          onClick={() => setHistorique((o) => !o)}
          title="Conversations précédentes"
          aria-label="Conversations précédentes"
          aria-expanded={historique}
        >
          <Icone de={History} taille={16} />
        </button>
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
      {historique && (
        <Flottant ancre={boutonHistorique.current} fermer={() => setHistorique(false)}>
          <HistoriqueIA session={session} enCours={enCours} fermer={() => setHistorique(false)} />
        </Flottant>
      )}

      <div
        className="fil-ia"
        ref={fil}
        onScroll={(e) => {
          const f = e.currentTarget
          enBas.current = f.scrollHeight - f.scrollTop - f.clientHeight < 40
        }}
      >
        {tours.length === 0 && (
          <p className="discret">
            Demande une modification en français : l’assistant te montre ce qu’il ferait avant de toucher à quoi que ce soit. Tape @ pour citer une base, / pour
            lancer un skill.
          </p>
        )}
        {tours.map((t, i) => {
          const dernier = i === tours.length - 1
          const aCopier = texteACopier(t.resultat)
          return (
            <div key={i} className="tour-ia">
              {(t.demande || t.skill || t.bases?.length) && (
                <div className="bulle-ia moi">
                  {(t.skill || t.bases?.length) && <Citations bases={(t.bases ?? []).map(nomBase)} skill={t.skill} />}
                  {t.demande}
                </div>
              )}
              {dernier && dernierModifiable && (
                <div className="actions-ia droite">
                  <BoutonIA icone={Pencil} titre="Modifier la demande" action={modifier} />
                </div>
              )}
              <BulleReponse resultat={t.resultat} appliquer={() => void session.appliquer(i)} annuler={() => session.annulerPlan(i)} />
              {t.resultat.type !== 'envoi' && (aCopier || (dernier && dernierModifiable)) && (
                <div className="actions-ia">
                  {aCopier && <BoutonIA icone={copie === i ? Check : Copy} titre={copie === i ? 'Copié' : 'Copier la réponse'} action={() => copier(i, aCopier)} />}
                  {dernier && dernierModifiable && (
                    <BoutonIA icone={RotateCcw} titre="Relancer la demande" action={() => session.relancer({ reglages: p.reglages, baseOuverte: p.baseOuverte })} />
                  )}
                </div>
              )}
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
          )
        })}
      </div>

      <div className="demande-ia">
        {suggestions.length > 0 && (
          <div className="suggestions-ia" role="listbox" aria-label={declencheur?.type === 'base' ? 'Bases' : 'Skills'}>
            {suggestions.map((s, k) => (
              <div
                key={s.valeur}
                role="option"
                aria-selected={k === choisie}
                className={`suggestion-ia${k === choisie ? ' choisie' : ''}`}
                // mousedown : le champ garde le focus et le curseur.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choisir(s.valeur)
                }}
                onMouseEnter={() => setChoisie(k)}
              >
                <Icone de={declencheur?.type === 'base' ? Table2 : WandSparkles} taille={14} />
                <span className="libelle-choix">{s.libelle}</span>
                {s.detail && <span className="discret detail-suggestion">{s.detail}</span>}
              </div>
            ))}
          </div>
        )}
        {(demande.skill || demande.bases.length > 0) && (
          <Citations
            bases={demande.bases.map(nomBase)}
            skill={demande.skill}
            retirerBase={(k) => changer({ ...demande, bases: demande.bases.filter((_, j) => j !== k) })}
            retirerSkill={() => changer({ texte: demande.texte, bases: demande.bases })}
          />
        )}
        <textarea
          ref={champ}
          autoFocus
          rows={1}
          value={demande.texte}
          aria-label="Demande à l’assistant"
          placeholder={tours.length === 0 ? 'Ex. : passe les tâches en retard en « Terminé »' : 'Répondre…'}
          onChange={(e) => {
            changer({ ...demande, texte: e.target.value })
            suivreCurseur(e.target.value, e.target.selectionStart)
          }}
          onSelect={(e) => suivreCurseur(e.currentTarget.value, e.currentTarget.selectionStart)}
          onBlur={() => setDeclencheur(null)}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const n = suggestions.length
                setChoisie((c) => (c + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
                return
              }
              if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                e.preventDefault()
                choisir(suggestions[choisie]!.valeur)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setDeclencheur(null)
                return
              }
            }
            // Effacer en tête de demande retire la dernière citation.
            const c = e.currentTarget
            if (e.key === 'Backspace' && c.selectionStart === 0 && c.selectionEnd === 0 && (demande.bases.length > 0 || demande.skill)) {
              e.preventDefault()
              changer(demande.bases.length > 0 ? { ...demande, bases: demande.bases.slice(0, -1) } : { texte: demande.texte, bases: demande.bases })
              return
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              envoyer()
            }
          }}
        />
        <div className="pied-ia discret">
          <Choix valeur={p.reglages.modele} entrees={entreesModeles} changer={p.changerModele} libelle="Modèle" className="choix-modele-ia" desactive={enCours} />
          {enCours ? (
            <button className="arret-ia" onClick={() => session.arreter()} title="Arrêter la demande" aria-label="Arrêter">
              <Icone de={Square} taille={12} />
              Arrêter
            </button>
          ) : (
            <button className="principal envoi-ia" onClick={envoyer} disabled={vide} aria-label="Envoyer" title="Envoyer (Entrée)">
              <Icone de={ArrowUp} taille={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

function BoutonIA({ icone, titre, action }: { icone: LucideIcon; titre: string; action: () => void }) {
  return (
    <button className="discret bouton-ia" onClick={action} title={titre} aria-label={titre}>
      <Icone de={icone} taille={14} />
    </button>
  )
}

/** Bases citées et skill choisi, en pastilles ; retirables dans la demande en cours de saisie. */
function Citations(p: { bases: string[]; skill?: string; retirerBase?: (k: number) => void; retirerSkill?: () => void }) {
  return (
    <span className="citations-ia">
      {p.skill && (
        <span className="citation-ia">
          <Icone de={WandSparkles} taille={12} />
          {p.skill}
          {p.retirerSkill && (
            <button className="discret" onClick={p.retirerSkill} aria-label={`Retirer le skill « ${p.skill} »`}>
              <Icone de={X} taille={11} />
            </button>
          )}
        </span>
      )}
      {p.bases.map((b, k) => (
        <span key={k} className="citation-ia">
          <Icone de={Table2} taille={12} />
          {b}
          {p.retirerBase && (
            <button className="discret" onClick={() => p.retirerBase!(k)} aria-label={`Retirer la base « ${b} »`}>
              <Icone de={X} taille={11} />
            </button>
          )}
        </span>
      ))}
    </span>
  )
}

/** Conversations gardées dans ce navigateur pour ce dossier : reprendre ou effacer. */
function HistoriqueIA({ session, enCours, fermer }: { session: SessionAssistant; enCours: boolean; fermer: () => void }) {
  const [, setVersion] = useState(0)
  const entrees = session.historique()
  if (entrees.length === 0) return <p className="discret historique-vide">Aucune conversation pour l’instant.</p>
  return (
    <ul className="historique-ia" aria-label="Conversations précédentes">
      {entrees.map((c) => (
        <li key={c.id} className={c.courante ? 'courante' : undefined}>
          <button
            className="discret ouvrir-conversation"
            disabled={enCours && !c.courante}
            onClick={() => {
              session.ouvrir(c.id)
              fermer()
            }}
          >
            <span className="libelle-choix">{c.titre}</span>
            <span className="discret">{c.courante ? 'en cours' : dateCourte(c.maj)}</span>
          </button>
          <button
            className="discret"
            disabled={enCours && c.courante}
            aria-label={`Effacer « ${c.titre} »`}
            title="Effacer cette conversation"
            onClick={() => {
              session.supprimer(c.id)
              setVersion((v) => v + 1)
            }}
          >
            <Icone de={X} taille={13} />
          </button>
        </li>
      ))}
    </ul>
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
    const noms = r.progression?.outils ?? []
    // Les lectures (lignes, pages) ne sont pas des propositions : le modèle va chercher ce qu'il lui manque.
    const lectures = noms.filter((n) => n === 'chercher_lignes' || n === 'lire_page').length
    const outils = noms.length - lectures
    return (
      <div className="bulle-ia">
        {texte && <ContenuMarkdown className="reponse-ia" texte={texte} />}
        <div className="etat-ia discret">
          <Icone de={Sparkles} /> {outils > 0 ? `Prépare ${pluriel(outils, 'proposition')}…` : lectures > 0 ? 'Lit les données…' : texte ? 'Écrit…' : 'Réflexion…'} {secondes(performance.now() - r.depuis)}
        </div>
      </div>
    )
  }
  if (r.type === 'erreur') return <div className="bulle-ia erreur">{r.message}</div>
  if (r.type === 'arrete') {
    return (
      <div className="bulle-ia">
        {r.texte && <ContenuMarkdown className="reponse-ia" texte={r.texte} />}
        <div className="etat-ia discret">Arrêté</div>
      </div>
    )
  }
  const duree = r.duree !== undefined && <div className="duree-ia discret">{secondes(r.duree)}</div>
  if (r.type === 'reponse') {
    if (!r.texte) return null
    return (
      <div className="bulle-ia">
        <ContenuMarkdown className="reponse-ia" texte={r.texte} />
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
      {r.message && <ContenuMarkdown className="reponse-ia" texte={r.message} />}
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
