import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, FileText, Search, Trash2, X } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import type { DocumentConnaissance } from '../core/ia/connaissance'
import { ContexteOuvrir, titreDe, useEspace } from './contexte-espace'
import { Icone } from './icones'
import { ContenuMarkdown } from './Markdown'
import type { SessionAssistant } from './sessionAssistant'
import { useLargeurPanneau } from './useLargeurPanneau'

// Documents et contexte de l'assistant (spec §18) : un panneau à droite, comme
// l'inbox, ouvert depuis la barre latérale quand le module Contexte IA est actif
// (§19). Les documents arrivent par l'inbox ; ici on les retrouve, on les lit,
// on suit les lignes qu'ils concernent, on les supprime.

export type OngletDocuments = 'documents' | 'contexte'

/** Documents relus à l'ouverture et après chaque tour de l'assistant (un plan appliqué en range de nouveaux). */
export type EtatDocuments = { documents: DocumentConnaissance[]; contexte: string; charge: boolean; relire: () => void }

export function useDocuments(espace: DepotEspace, session: SessionAssistant): EtatDocuments {
  const [etat, setEtat] = useState<{ documents: DocumentConnaissance[]; contexte: string; charge: boolean }>({ documents: [], contexte: '', charge: false })
  const tours = useSyncExternalStore(session.abonner, session.lire)
  // Seule la dernière relecture demandée s'affiche (voir useInbox).
  const derniere = useRef(0)
  const relire = useMemo(
    () => () => {
      const n = ++derniere.current
      void espace.assistant.connaissance.lire().then(
        (c) => n === derniere.current && setEtat({ documents: c.documents, contexte: c.contexte, charge: true }),
        () => n === derniere.current && setEtat({ documents: [], contexte: '', charge: true }),
      )
    },
    [espace],
  )
  useEffect(relire, [relire, tours])
  return { ...etat, relire }
}

const plier = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const jour = (date: string) => date.split('-').reverse().join('/')
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const mois = (date: string) => (/^\d{4}-\d{2}/.test(date) ? MOIS.format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`)) : 'Sans date')

/** Passage autour du premier mot cherché trouvé dans le texte. */
function extrait(texte: string, mots: string[]): string | null {
  const plie = plier(texte)
  const i = Math.min(...mots.map((m) => plie.indexOf(m)).filter((n) => n >= 0))
  if (!Number.isFinite(i)) return null
  const debut = Math.max(0, i - 60)
  // Sans la syntaxe Markdown (titres, puces, tableaux), qui n'aide pas à lire un extrait.
  const passage = texte
    .slice(debut, i + 120)
    .replace(/^\s*(#{1,6}|[-*]|\d+\.)\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${debut > 0 ? '…' : ''}${passage}…`
}

export function PanneauDocuments(p: {
  espace: DepotEspace
  documents: DocumentConnaissance[]
  contexte: string
  charge: boolean
  relire: () => void
  onglet: OngletDocuments
  changerOnglet: (o: OngletDocuments) => void
  fermer: () => void
}) {
  const [largeur, saisirPoignee] = useLargeurPanneau('mdbase.largeurDocuments', 460)
  // Relus à l'ouverture : la synchro du dossier a pu en apporter.
  useEffect(p.relire, [p.relire])
  const aJour = p.documents.filter((d) => !d.remplacePar).length
  return (
    <aside className="panneau-ia panneau-documents" style={{ width: largeur }} aria-label="Documents">
      <div className="poignee-page" onPointerDown={saisirPoignee} title="Élargir ou rétrécir" />
      <header className="entete-ia">
        <div className="onglets-documents" role="tablist">
          <button role="tab" aria-selected={p.onglet === 'documents'} className={p.onglet === 'documents' ? 'actif' : ''} onClick={() => p.changerOnglet('documents')}>
            Documents{aJour > 0 && <span className="compte-onglet">{aJour}</span>}
          </button>
          <button role="tab" aria-selected={p.onglet === 'contexte'} className={p.onglet === 'contexte' ? 'actif' : ''} onClick={() => p.changerOnglet('contexte')}>
            Contexte
          </button>
        </div>
        <button className="discret bascule-mode" onClick={p.fermer} title="Fermer" aria-label="Fermer les documents">
          <Icone de={X} taille={17} />
        </button>
      </header>
      {p.onglet === 'documents' ? <ListeDocuments {...p} /> : p.charge && <EditeurContexte espace={p.espace} contexte={p.contexte} relire={p.relire} />}
    </aside>
  )
}

function ListeDocuments(p: { espace: DepotEspace; documents: DocumentConnaissance[]; relire: () => void }) {
  const [recherche, setRecherche] = useState('')
  const [remplaces, setRemplaces] = useState(false)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const document = p.documents.find((d) => d.id === ouvert)
  if (document) return <FicheDocument {...p} document={document} ouvrir={setOuvert} retour={() => setOuvert(null)} />

  const mots = plier(recherche).split(/\s+/).filter(Boolean)
  const nbRemplaces = p.documents.filter((d) => d.remplacePar).length
  const retenus = p.documents
    .filter((d) => remplaces || !d.remplacePar)
    .flatMap((d) => {
      if (mots.length === 0) return [{ d, passage: null as string | null }]
      const tout = plier(`${d.titre} ${d.source ?? ''} ${d.texte}`)
      return mots.every((m) => tout.includes(m)) ? [{ d, passage: mots.some((m) => plier(d.titre).includes(m)) ? null : extrait(d.texte, mots) }] : []
    })
  // Regroupés par mois, du plus récent au plus ancien (la liste arrive triée par date).
  const groupes: { mois: string; elements: typeof retenus }[] = []
  for (const r of retenus) {
    const m = mois(r.d.date)
    if (groupes.at(-1)?.mois !== m) groupes.push({ mois: m, elements: [] })
    groupes.at(-1)!.elements.push(r)
  }

  return (
    <div className="fil-ia documents">
      <label className="recherche-documents">
        <Icone de={Search} taille={14} />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher dans les documents" aria-label="Chercher dans les documents" />
      </label>
      {nbRemplaces > 0 && (
        <label className="case-a-cocher filtre-remplaces">
          <input type="checkbox" checked={remplaces} onChange={(e) => setRemplaces(e.target.checked)} />
          Montrer les documents remplacés ({nbRemplaces})
        </label>
      )}
      {p.documents.length === 0 ? (
        <p className="discret">Aucun document : les présentations et comptes rendus traités depuis l’inbox arrivent ici, et l’assistant y cherche quand ta demande en parle.</p>
      ) : retenus.length === 0 ? (
        <p className="discret">Aucun document ne correspond.</p>
      ) : (
        groupes.map((g) => (
          <section key={g.mois} className="liste-inbox">
            <div className="titre-section mois-documents">{g.mois}</div>
            <ul aria-label={`Documents de ${g.mois}`}>
              {g.elements.map(({ d, passage }) => (
                <li key={d.id} className={d.remplacePar ? 'remplace' : ''}>
                  <Icone de={FileText} taille={14} />
                  <span className="element-inbox">
                    <button className="titre-element" onClick={() => setOuvert(d.id)}>
                      <span className="libelle-choix">{d.titre}</span>
                    </button>
                    <span className="discret">
                      {jour(d.date)}
                      {d.source ? ` · ${d.source}` : ''}
                      {d.lignes.length > 0 ? ` · ${d.lignes.length} ligne${d.lignes.length > 1 ? 's' : ''}` : ''}
                      {d.remplacePar ? ' · remplacé' : ''}
                    </span>
                    {passage && <span className="discret apercu-element">{passage}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function FicheDocument(p: { espace: DepotEspace; documents: DocumentConnaissance[]; document: DocumentConnaissance; relire: () => void; ouvrir: (id: string) => void; retour: () => void }) {
  const { etat } = useEspace()
  const ouvrirLigne = useContext(ContexteOuvrir)
  const [supprimer, setSupprimer] = useState(false)
  const d = p.document
  const remplacant = d.remplacePar ? p.documents.find((x) => x.id === d.remplacePar) : undefined
  const remplace = p.documents.filter((x) => x.remplacePar === d.id)
  return (
    <div className="fil-ia documents fiche-document">
      <div className="titre-inbox">
        <button className="discret action-inbox" onClick={p.retour}>
          <Icone de={ArrowLeft} taille={14} /> Tous les documents
        </button>
        {supprimer ? (
          <span className="confirmer-inbox">
            <button className="discret" onClick={() => setSupprimer(false)}>
              Garder
            </button>
            <button className="danger" onClick={() => void p.espace.assistant.connaissance.supprimerDocument(d.id).then(() => (p.retour(), p.relire()))}>
              Supprimer
            </button>
          </span>
        ) : (
          <button className="discret action-inbox" onClick={() => setSupprimer(true)} aria-label={`Supprimer le document « ${d.titre} »`}>
            <Icone de={Trash2} taille={14} /> Supprimer
          </button>
        )}
      </div>
      <h3 className="titre-document">{d.titre}</h3>
      <dl className="infos-document">
        <dt>Date</dt>
        <dd>{jour(d.date)}</dd>
        {d.source && (
          <>
            <dt>Fichier</dt>
            <dd>{d.source}</dd>
          </>
        )}
        {d.ajoute && (
          <>
            <dt>Rangé le</dt>
            <dd>{d.ajoute.replace(/^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d).*/, '$3/$2/$1 à $4')}</dd>
          </>
        )}
        {d.lignes.length > 0 && (
          <>
            <dt>Concerne</dt>
            <dd className="lignes-document">
              {d.lignes.map((l) => {
                const [base = '', id = ''] = l.split('/')
                const titre = titreDe(etat, base, id)
                const nomBase = etat.bases.get(base)?.depot?.schema.nom ?? base
                return titre !== null && ouvrirLigne ? (
                  <button key={l} className="citation-ia" onClick={() => ouvrirLigne(base, id)} title={`Ouvrir dans ${nomBase}`}>
                    {titre}
                  </button>
                ) : (
                  <span key={l} className="citation-ia discret" title="Ligne introuvable (supprimée ?)">
                    {l}
                  </span>
                )
              })}
            </dd>
          </>
        )}
        {d.remplacePar && (
          <>
            <dt>Remplacé par</dt>
            <dd>{remplacant ? <button className="lien-document" onClick={() => p.ouvrir(remplacant.id)}>{remplacant.titre}</button> : d.remplacePar}</dd>
          </>
        )}
        {remplace.length > 0 && (
          <>
            <dt>Remplace</dt>
            <dd className="lignes-document">
              {remplace.map((x) => (
                <button key={x.id} className="lien-document" onClick={() => p.ouvrir(x.id)}>
                  {x.titre}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>
      <ContenuMarkdown texte={d.texte} className="texte-document" />
    </div>
  )
}

/** Sections conseillées d'un contexte neuf (spec §18). */
export const MODELE_CONTEXTE = `## Organisation
Ce que représente chaque base et comment elles s'emboîtent (ex. Projet → Version → Lot → Ticket).

## Propagation
Ce qui découle d'un changement (ex. un lot qui glisse décale la livraison de sa version).

## Remarques
Pour chaque base, où noter une remarque dans le corps des pages (ex. section « Remarques », une entrée datée).

## Vocabulaire, rituels, interlocuteurs
`

const TAILLE_CONSEILLEE = 8000

function EditeurContexte(p: { espace: DepotEspace; contexte: string; relire: () => void }) {
  const [texte, setTexte] = useState(p.contexte || MODELE_CONTEXTE)
  const [enregistre, setEnregistre] = useState(false)
  const modifie = texte.trim() !== p.contexte.trim() && !(p.contexte === '' && texte === MODELE_CONTEXTE)
  return (
    <div className="fil-ia contexte-ia">
      <p className="discret">Envoyé à l’assistant à chaque demande : explique ton organisation une fois, il n’aura plus à la redemander.</p>
      <textarea
        value={texte}
        aria-label="Contexte"
        spellCheck
        onChange={(e) => {
          setTexte(e.target.value)
          setEnregistre(false)
        }}
      />
      <div className="boutons">
        <span className={`discret ${texte.length > TAILLE_CONSEILLEE ? 'danger-texte' : ''}`}>
          {enregistre ? 'Enregistré. ' : ''}
          {texte.length.toLocaleString('fr-FR')} caractères{texte.length > TAILLE_CONSEILLEE ? ` : au-delà de ${TAILLE_CONSEILLEE.toLocaleString('fr-FR')}, chaque demande coûte plus cher` : ''}
        </span>
        <button
          className="principal"
          disabled={!modifie}
          onClick={() =>
            void p.espace.assistant.connaissance.ecrireContexte(texte).then(() => {
              setEnregistre(true)
              p.relire()
            })
          }
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}
