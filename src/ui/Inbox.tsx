import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronDown, ChevronRight, FileText, Paperclip, Sparkles, StickyNote, Trash2, X } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { horodatage, type ElementInbox, type ElementTraite } from '../core/ia/connaissance'
import { convertirFichier, EXTENSIONS } from '../adapters/conversion/convertir'
import { maintenant } from '../adapters/navigateur'
import { Icone } from './icones'
import type { SessionAssistant } from './sessionAssistant'
import { useLargeurPanneau } from './useLargeurPanneau'

// Inbox (spec §18, « Inbox ») : une page à part, dans un panneau à droite comme
// l'assistant, où tout se dépose. Elle sert sans l'assistant ; avec lui, chaque
// élément (ou tous) peut lui être envoyé, et ce qui a été traité reste dans un
// historique replié.

export type EtatInbox = { attente: ElementInbox[]; traites: ElementTraite[]; relire: () => void }

/** Inbox relue à l'ouverture, après chaque tour de l'assistant (un plan appliqué la change) et au retour sur l'onglet. */
export function useInbox(espace: DepotEspace, session: SessionAssistant): EtatInbox {
  const [etat, setEtat] = useState<{ attente: ElementInbox[]; traites: ElementTraite[] }>({ attente: [], traites: [] })
  const tours = useSyncExternalStore(session.abonner, session.lire)
  const relire = useCallback(
    () =>
      void espace.assistant.connaissance.lire().then(
        (c) => setEtat({ attente: c.inbox, traites: c.traites }),
        () => setEtat({ attente: [], traites: [] }),
      ),
    [espace],
  )
  useEffect(relire, [relire, tours])
  useEffect(() => {
    const retour = () => document.visibilityState === 'visible' && relire()
    document.addEventListener('visibilitychange', retour)
    return () => document.removeEventListener('visibilitychange', retour)
  }, [relire])
  return { ...etat, relire }
}

/** « 07/10 à 09:15 » pour une date `AAAA-MM-JJTHH:MM`. */
const le = (date: string) => {
  const m = /^\d{4}-(\d\d)-(\d\d)T(\d\d:\d\d)/.exec(date)
  return m ? `${m[2]}/${m[1]} à ${m[3]}` : date
}

const APERCU = 160

export function PanneauInbox(p: {
  espace: DepotEspace
  inbox: EtatInbox
  /** Absent quand l'assistant n'est pas activé : pas de bouton « Envoyer à l'IA ». */
  envoyer?: (elements: ElementInbox[]) => void
  /** Une demande de l'assistant tourne déjà. */
  occupe: boolean
  fermer: () => void
}) {
  const { espace, inbox } = p
  const [texte, setTexte] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [survol, setSurvol] = useState(false)
  const [deplie, setDeplie] = useState<string | null>(null)
  const [historique, setHistorique] = useState(false)
  const [vider, setVider] = useState(false)
  const choixFichier = useRef<HTMLInputElement>(null)
  const [largeur, saisirPoignee] = useLargeurPanneau('mdbase.largeurInbox', 420)
  // Relue à l'ouverture : la synchro du dossier a pu apporter des éléments.
  useEffect(inbox.relire, [inbox.relire])

  /** Dépose des fichiers, convertis en Markdown ; les limites de la conversion sont dites. */
  const deposerFichiers = async (fichiers: readonly File[]) => {
    const dites: string[] = []
    for (const f of fichiers) {
      try {
        const c = await convertirFichier(f.name, new Uint8Array(await f.arrayBuffer()))
        if (c.texte.trim() === '') dites.push(`${f.name} : aucun texte lu, non ajouté.`)
        else {
          await espace.assistant.connaissance.deposer({ titre: c.titre, texte: c.texte, source: f.name }, horodatage(new Date()))
          dites.push(...c.avertissements.map((a) => `${f.name} : ${a}.`))
        }
      } catch (e) {
        dites.push(`${f.name} : ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setNotes(dites)
    inbox.relire()
  }
  const ajouter = async () => {
    if (texte.trim() === '') return
    const premiere = texte.trim().split('\n')[0]!.trim()
    await espace.assistant.connaissance.deposer({ titre: premiere.length > 60 ? `${premiere.slice(0, 60)}…` : premiere, texte: texte.trim() }, horodatage(new Date()))
    setTexte('')
    setNotes([])
    inbox.relire()
  }
  const agir = (action: Promise<void>) => void action.then(inbox.relire)
  // Du plus récent au plus ancien.
  const attente = [...inbox.attente].reverse()

  return (
    <aside
      className={`panneau-ia panneau-inbox${survol ? ' depot-ia' : ''}`}
      style={{ width: largeur }}
      aria-label="Inbox"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setSurvol(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false)
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return
        e.preventDefault()
        setSurvol(false)
        void deposerFichiers([...e.dataTransfer.files])
      }}
    >
      <div className="poignee-page" onPointerDown={saisirPoignee} title="Élargir ou rétrécir" />
      <header className="entete-ia">
        <h2>Inbox</h2>
        <button className="discret bascule-mode" onClick={p.fermer} title="Fermer l’inbox" aria-label="Fermer l’inbox">
          <Icone de={X} taille={17} />
        </button>
      </header>
      <div className="fil-ia inbox">
        <div className="depot-inbox">
          <textarea
            rows={3}
            value={texte}
            aria-label="Information à déposer"
            placeholder="Une remarque, un mail collé… ou lâche un fichier ici (PDF, Word, PowerPoint)"
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void ajouter()
              }
            }}
          />
          <input
            ref={choixFichier}
            type="file"
            multiple
            hidden
            accept={EXTENSIONS.join(',')}
            onChange={(e) => {
              if (e.target.files?.length) void deposerFichiers([...e.target.files])
              e.target.value = ''
            }}
          />
          <div className="boutons">
            <button className="discret" onClick={() => choixFichier.current?.click()} title="Joindre un fichier (ou lâche-le sur le panneau)">
              <Icone de={Paperclip} taille={14} /> Fichier
            </button>
            <button className="principal" onClick={() => void ajouter()} disabled={texte.trim() === ''}>
              Ajouter
            </button>
          </div>
          {notes.map((n, i) => (
            <p key={i} className="discret note-inbox">
              {n}
            </p>
          ))}
        </div>

        <section className="liste-inbox">
          <div className="titre-inbox">
            <span className="titre-section">À traiter ({attente.length})</span>
            {p.envoyer && attente.length > 1 && (
              <button className="discret action-inbox" onClick={() => p.envoyer!(inbox.attente)} disabled={p.occupe}>
                <Icone de={Sparkles} taille={14} /> Tout envoyer à l’IA
              </button>
            )}
          </div>
          {attente.length === 0 ? (
            <p className="discret">Rien en attente.</p>
          ) : (
            <ul aria-label="À traiter">
              {attente.map((e) => {
                const ouvert = deplie === e.id
                return (
                  <li key={e.id}>
                    <Icone de={e.source ? FileText : StickyNote} taille={14} />
                    <span className="element-inbox">
                      <button className="titre-element" onClick={() => setDeplie(ouvert ? null : e.id)} aria-expanded={ouvert}>
                        <span className="libelle-choix">{e.titre}</span>
                      </button>
                      <span className="discret">
                        {le(e.recu)}
                        {e.source ? ` · ${e.source}` : ''}
                      </span>
                      {e.question && <span className="question-inbox">{e.question}</span>}
                      {ouvert ? <pre className="texte-element">{e.texte}</pre> : e.texte !== e.titre && <span className="discret apercu-element">{e.texte.length > APERCU ? `${e.texte.slice(0, APERCU)}…` : e.texte}</span>}
                    </span>
                    <span className="actions-element">
                      {p.envoyer && (
                        <button className="discret bouton-ia" title="Envoyer à l’IA" aria-label={`Envoyer « ${e.titre} » à l’IA`} disabled={p.occupe} onClick={() => p.envoyer!([e])}>
                          <Icone de={Sparkles} taille={14} />
                        </button>
                      )}
                      <button className="discret bouton-ia" title="Marquer traité" aria-label={`Marquer « ${e.titre} » traité`} onClick={() => agir(espace.assistant.connaissance.marquerTraite(e.id, maintenant()))}>
                        <Icone de={Check} taille={14} />
                      </button>
                      <button className="discret bouton-ia" title="Supprimer" aria-label={`Supprimer « ${e.titre} »`} onClick={() => agir(espace.assistant.connaissance.retirer(e.id))}>
                        <Icone de={Trash2} taille={14} />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {inbox.traites.length > 0 && (
          <section className="liste-inbox traites">
            <div className="titre-inbox">
              <button className="discret titre-section depli" onClick={() => setHistorique((h) => !h)} aria-expanded={historique}>
                <Icone de={historique ? ChevronDown : ChevronRight} taille={14} /> Traités ({inbox.traites.length})
              </button>
              {historique &&
                (vider ? (
                  <span className="confirmer-inbox">
                    <button className="discret" onClick={() => setVider(false)}>
                      Garder
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setVider(false)
                        agir(espace.assistant.connaissance.viderHistorique())
                      }}
                    >
                      Tout supprimer
                    </button>
                  </span>
                ) : (
                  <button className="discret action-inbox" onClick={() => setVider(true)}>
                    Vider l’historique
                  </button>
                ))}
            </div>
            {historique && (
              <ul aria-label="Traités">
                {inbox.traites.map((e) => (
                  <li key={e.id}>
                    <Icone de={Check} taille={14} />
                    <span className="element-inbox">
                      <span className="libelle-choix">{e.titre}</span>
                      <span className="discret">
                        traité le {le(e.traite)}
                        {e.source ? ` · ${e.source}` : ''}
                      </span>
                      <ul className="bilan-inbox">
                        {e.bilan.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
