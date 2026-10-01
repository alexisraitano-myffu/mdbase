import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Settings2, TriangleAlert } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import type { Schema, Source } from '../core/schema'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { useModeConsultation } from './mode'

// Base Jira dans l'app (spec §16) : création, réglages de la source et état de
// la dernière synchro. Les tickets eux-mêmes sont écrits par le script
// mdbase-jira.mjs, lancé sur le poste : Jira refuse les appels d'un navigateur.

/** Le script, publié à côté de l'app. */
const SCRIPT = `${import.meta.env.BASE_URL}mdbase-jira.mjs`
/** Au-delà, la synchro semble arrêtée (le script tourne toutes les 5 minutes). */
const ANCIENNE_APRES_MIN = 30

/** « https://exemple.atlassian.net/jira/… » ou « exemple.atlassian.net » : le seul domaine. */
function nettoyerSite(site: string): string {
  return site.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

/** « PRVE, ops ; DATA » : des clés de projet, en majuscules, sans doublon. */
function lireProjets(texte: string): string[] {
  return [...new Set(texte.split(/[\s,;]+/).map((p) => p.trim().toUpperCase()).filter((p) => p !== ''))]
}

/** Site, projets et filtre JQL, communs à la création et aux réglages. */
function ChampsSource(p: { site: string; projets: string; jql: string; changer: (c: { site?: string; projets?: string; jql?: string }) => void; auto?: boolean }) {
  return (
    <div className="champs-source">
      <label>
        <span className="nom-reglage">Site Jira</span>
        <input value={p.site} autoFocus={p.auto} placeholder="exemple.atlassian.net" onChange={(e) => p.changer({ site: e.target.value })} />
      </label>
      <label>
        <span className="nom-reglage">Projets suivis</span>
        <input value={p.projets} placeholder="PRVE, OPS" onChange={(e) => p.changer({ projets: e.target.value })} />
        <span className="discret aide-reglage">Les clés des projets, séparées par des virgules.</span>
      </label>
      <label>
        <span className="nom-reglage">Filtre JQL (facultatif)</span>
        <input value={p.jql} placeholder="statusCategory != Done" onChange={(e) => p.changer({ jql: e.target.value })} />
        <span className="discret aide-reglage">S’ajoute aux projets : seuls les tickets qui y répondent sont synchronisés.</span>
      </label>
    </div>
  )
}

function sourceDe(type: string, c: { site: string; projets: string; jql: string }): Source {
  const jql = c.jql.trim()
  return { type, site: nettoyerSite(c.site), projets: lireProjets(c.projets), ...(jql && { jql }) }
}

/** « Nouvelle base Jira » : nom, site et projets ; la base se remplit au premier passage du script. */
export function FenetreBaseJira(p: { espace: DepotEspace; fermer: () => void; ouvrir: (id: string) => void }) {
  const lancer = useLancer()
  const [nom, setNom] = useState('Tickets Jira')
  const [champs, setChamps] = useState({ site: '', projets: '', jql: '' })
  const source = sourceDe('jira', champs)
  const valide = nom.trim() !== '' && source.site !== '' && source.projets.length > 0

  const creer = async () => {
    const id = await lancer(p.espace.creerBaseJira(nom, source))
    p.fermer()
    if (id) p.ouvrir(id)
  }

  return (
    <Fenetre titre="Nouvelle base Jira" fermer={p.fermer}>
      <div className="import">
        <p className="discret">
          Les tickets des projets choisis arrivent en lecture seule : rien n’est jamais écrit dans Jira. Un script lancé sur ton poste les
          recopie dans l’espace ; la base t’explique comment le lancer une fois créée.
        </p>
        <div className="champs-source">
          <label>
            <span className="nom-reglage">Nom de la base</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
        </div>
        <ChampsSource {...champs} auto changer={(c) => setChamps({ ...champs, ...c })} />
        <div className="boutons">
          <button className="discret" onClick={p.fermer}>
            Annuler
          </button>
          <button className="principal" disabled={!valide} onClick={() => void creer()}>
            Créer la base
          </button>
        </div>
      </div>
    </Fenetre>
  )
}

/** « 2026-10-01T10:05 » : « à 10:05 » aujourd'hui, « le 30/09 à 10:05 » sinon, et l'âge en minutes. */
function quand(derniere: string, maintenant: Date): { texte: string; minutes: number } {
  const [jour = '', heure = ''] = derniere.split('T')
  const [a, m, j] = jour.split('-').map(Number)
  const [h, min] = heure.split(':').map(Number)
  const date = new Date(a ?? 0, (m ?? 1) - 1, j ?? 1, h ?? 0, min ?? 0)
  const minutes = Math.floor((maintenant.getTime() - date.getTime()) / 60000)
  const memeJour = date.toDateString() === maintenant.toDateString()
  return { texte: memeJour ? `à ${heure}` : `le ${jour.slice(8, 10)}/${jour.slice(5, 7)} à ${heure}`, minutes }
}

/** Redessine chaque minute : l'âge de la dernière synchro avance même quand rien ne change. */
function useMinute(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return maintenant
}

/** Bandeau d'une base Jira : dernière synchro, erreur éventuelle, réglages de la source. */
export function BandeauSynchro({ espace, base, schema }: { espace: DepotEspace; base: string; schema: Schema }) {
  const synchro = useEspace().etat.bases.get(base)?.synchro ?? {}
  const maintenant = useMinute()
  const consultation = useModeConsultation()
  const [reglages, setReglages] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  if (!schema.source) return null

  const age = synchro.derniere ? quand(synchro.derniere, maintenant) : null
  const n = synchro.tickets ?? 0
  return (
    <div className={`bandeau-synchro ${synchro.erreur ? 'en-erreur' : ''}`}>
      <div className="etat-synchro">
        {synchro.erreur ? <Icone de={TriangleAlert} className="alerte" /> : <Icone de={RefreshCw} />}
        {age ? (
          <span>
            Synchronisée depuis Jira {age.texte}, {n} ticket{n > 1 ? 's' : ''} suivi{n > 1 ? 's' : ''}
            {age.minutes > ANCIENNE_APRES_MIN && !synchro.erreur && <span className="discret"> (le script ne tourne plus ?)</span>}
          </span>
        ) : (
          <span>Pas encore synchronisée</span>
        )}
        {!consultation && (
          <button ref={ancre} className="discret" onClick={() => setReglages(true)} title="Site, projets suivis, filtre JQL">
            <Icone de={Settings2} /> Réglages
          </button>
        )}
      </div>
      {synchro.erreur && <div className="erreur-synchro">Dernier passage du script en échec : {synchro.erreur}</div>}
      {!age && !synchro.erreur && <LancerScript />}
      {reglages && <ReglagesSource espace={espace} base={base} source={schema.source} ancre={ancre.current} fermer={() => setReglages(false)} />}
    </div>
  )
}

/** Comment lancer le script, tant que la base n'a jamais été synchronisée. */
function LancerScript() {
  return (
    <div className="lancer-script">
      <p>
        Les tickets sont recopiés par un script lancé sur ton poste (Node.js), qui tourne en fond et resynchronise toutes les 5 minutes. Au
        premier lancement, il demande ton e-mail Atlassian et un token d’API, gardés sur le poste, jamais dans l’espace.
      </p>
      <a className="bouton" href={SCRIPT} download="mdbase-jira.mjs">
        <Icone de={Download} /> Télécharger le script
      </a>
      <code>node mdbase-jira.mjs "dossier de l’espace" --suivre</code>
    </div>
  )
}

function ReglagesSource(p: { espace: DepotEspace; base: string; source: Source; ancre: HTMLElement | null; fermer: () => void }) {
  const lancer = useLancer()
  const [champs, setChamps] = useState({ site: p.source.site, projets: p.source.projets.join(', '), jql: p.source.jql ?? '' })
  const suivante = sourceDe(p.source.type, champs)
  const valide = suivante.site !== '' && suivante.projets.length > 0
  return (
    <Flottant ancre={p.ancre} fermer={p.fermer} garderOuvert>
      <div className="titre-panneau">Source Jira</div>
      <ChampsSource {...champs} changer={(c) => setChamps({ ...champs, ...c })} />
      <p className="discret aide-source">Le script relit ces réglages à son prochain passage, et relit alors tous les tickets.</p>
      <div className="boutons">
        <button className="discret" onClick={p.fermer}>
          Annuler
        </button>
        <button
          className="principal"
          disabled={!valide}
          onClick={() => {
            void lancer(p.espace.modifierSource(p.base, suivante))
            p.fermer()
          }}
        >
          Enregistrer
        </button>
      </div>
    </Flottant>
  )
}
