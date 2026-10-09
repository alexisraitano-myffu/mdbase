import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, KeyRound, RefreshCw, Settings2, Terminal, TriangleAlert } from 'lucide-react'
import type { DepotEspace } from '../core/depot-espace'
import { domaineJira, messageErreurJira } from '../core/jira/client'
import type { Schema, Source } from '../core/schema'
import { estBureau } from '../adapters/tauri/bureau'
import { connecterJira, oublierJira, retirerScriptAuDemarrage } from '../adapters/tauri/jira'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { useModeConsultation } from './mode'
import { relireConnexion, synchroniserJiraMaintenant, useEtatSynchroJira, verifierScriptAuDemarrage } from './synchroJira'

// Base Jira dans l'app (spec §16) : création, réglages de la source et état de
// la dernière synchro. Dans le navigateur, les tickets sont écrits par le script
// mdbase-jira.mjs, lancé sur le poste : Jira refuse les appels d'une page. L'app
// de bureau synchronise elle-même (synchroJira.ts) : connexion et bouton
// « Synchroniser » à la place du script.

const BUREAU = estBureau()
/** Page Atlassian où créer un token d'API. */
const PAGE_TOKENS = 'https://id.atlassian.com/manage-profile/security/api-tokens'

/** Le script, publié à côté de l'app. */
const SCRIPT = `${import.meta.env.BASE_URL}mdbase-jira.mjs`
/** Au-delà, la synchro semble arrêtée (le script tourne toutes les 5 minutes). */
const ANCIENNE_APRES_MIN = 30

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
  return { type, site: domaineJira(c.site), projets: lireProjets(c.projets), ...(jql && { jql }) }
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
    if (id && BUREAU) synchroniserJiraMaintenant()
  }

  return (
    <Fenetre titre="Nouvelle base Jira" fermer={p.fermer}>
      <div className="import">
        <p className="discret">
          Les tickets des projets choisis arrivent en lecture seule : rien n’est jamais écrit dans Jira.{' '}
          {BUREAU
            ? 'L’app les recopie dans l’espace toutes les 5 minutes tant qu’elle est ouverte ; la base te demandera ta connexion Jira une fois créée.'
            : 'Un script lancé sur ton poste les recopie dans l’espace ; la base t’explique comment le lancer une fois créée.'}
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
  const [script, setScript] = useState(false)
  const ancreScript = useRef<HTMLButtonElement>(null)
  const [connexion, setConnexion] = useState(false)
  const ancreConnexion = useRef<HTMLButtonElement>(null)
  const jira = useEtatSynchroJira()
  const site = domaineJira(schema.source?.site ?? '')
  useEffect(() => {
    if (BUREAU && site) void relireConnexion(site)
  }, [site])
  if (!schema.source) return null
  const email = jira.connexions[site]

  const age = synchro.derniere ? quand(synchro.derniere, maintenant) : null
  const n = synchro.tickets ?? 0
  return (
    <div className={`bandeau-synchro ${synchro.erreur ? 'en-erreur' : ''}`}>
      <div className="etat-synchro">
        {synchro.erreur ? <Icone de={TriangleAlert} className="alerte" /> : <Icone de={RefreshCw} />}
        {age ? (
          <span>
            Synchronisée depuis Jira {age.texte}, {n} ticket{n > 1 ? 's' : ''} suivi{n > 1 ? 's' : ''}
            {!BUREAU && age.minutes > ANCIENNE_APRES_MIN && !synchro.erreur && <span className="discret"> (le script ne tourne plus ?)</span>}
          </span>
        ) : (
          <span>Pas encore synchronisée</span>
        )}
        {BUREAU && email && (
          <button className="discret" onClick={synchroniserJiraMaintenant} disabled={jira.enCours} title="Relire Jira tout de suite">
            <Icone de={RefreshCw} className={jira.enCours ? 'tourne' : undefined} /> {jira.enCours ? 'Synchronisation…' : 'Synchroniser'}
          </button>
        )}
        {BUREAU && email && (
          <button ref={ancreConnexion} className="discret" onClick={() => setConnexion(true)} title={`Connecté en tant que ${email}`}>
            <Icone de={KeyRound} /> Connexion
          </button>
        )}
        {!BUREAU && age && (
          <button ref={ancreScript} className="discret" onClick={() => setScript(true)} title="Télécharger le script, le lancer avec Windows">
            <Icone de={Terminal} /> Script
          </button>
        )}
        {!consultation && (
          <button ref={ancre} className="discret" onClick={() => setReglages(true)} title="Site, projets suivis, filtre JQL">
            <Icone de={Settings2} /> Réglages
          </button>
        )}
      </div>
      {synchro.erreur && (
        <div className="erreur-synchro">
          {BUREAU ? 'Dernière synchro en échec' : 'Dernier passage du script en échec'} : {synchro.erreur}
        </div>
      )}
      {BUREAU && email === null && <ConnexionJira site={site} />}
      {BUREAU && jira.scriptAuDemarrage && <ScriptAuDemarrage />}
      {!BUREAU && !age && !synchro.erreur && <LancerScript />}
      {connexion && email && (
        <Flottant ancre={ancreConnexion.current} fermer={() => setConnexion(false)} garderOuvert>
          <div className="titre-panneau">Connexion Jira</div>
          <ConnexionJira site={site} email={email} fermer={() => setConnexion(false)} />
        </Flottant>
      )}
      {script && (
        <Flottant ancre={ancreScript.current} fermer={() => setScript(false)}>
          <div className="titre-panneau">Script de synchro</div>
          <LancerScript />
        </Flottant>
      )}
      {reglages && <ReglagesSource espace={espace} base={base} source={schema.source} ancre={ancre.current} fermer={() => setReglages(false)} />}
    </div>
  )
}

/**
 * E-mail et token d'API pour un site (app de bureau) : vérifiés auprès de Jira,
 * puis gardés par le gestionnaire d'identifiants du système. Le token saisi ne
 * revient jamais : le champ reste vide quand une connexion existe.
 */
function ConnexionJira(p: { site: string; email?: string; fermer?: () => void }) {
  const [email, setEmail] = useState(p.email ?? '')
  const [token, setToken] = useState('')
  const [etat, setEtat] = useState<{ enCours: boolean; erreur?: string }>({ enCours: false })
  const valide = email.trim() !== '' && token.trim() !== '' && !etat.enCours

  const connecter = async () => {
    setEtat({ enCours: true })
    try {
      const r = await connecterJira(p.site, email, token)
      if (r.statut < 200 || r.statut >= 300) return setEtat({ enCours: false, erreur: messageErreurJira(r.statut, r.texte, 'vérifie-les') })
      setToken('')
      setEtat({ enCours: false })
      await relireConnexion(p.site)
      synchroniserJiraMaintenant()
      p.fermer?.()
    } catch (e) {
      setEtat({ enCours: false, erreur: e instanceof Error ? e.message : String(e) })
    }
  }
  const oublier = async () => {
    await oublierJira(p.site).catch(() => undefined)
    await relireConnexion(p.site)
    p.fermer?.()
  }

  return (
    <div className="connexion-jira">
      <p>
        {p.email ? (
          <>
            Connecté à {p.site} en tant que <strong>{p.email}</strong>. Pour changer de token, saisis-le ici.
          </>
        ) : (
          <>Pour recopier les tickets de {p.site}, l’app a besoin de ton e-mail Atlassian et d’un token d’API.</>
        )}{' '}
        Ils sont vérifiés auprès de Jira, puis gardés par le gestionnaire d’identifiants de Windows : jamais dans l’espace.
      </p>
      <div className="champs-source">
        <label>
          <span className="nom-reglage">E-mail Atlassian</span>
          <input value={email} type="email" autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span className="nom-reglage">Token d’API</span>
          <input
            value={token}
            type="password"
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valide) void connecter()
            }}
          />
          <span className="discret aide-reglage">À créer sur la page Atlassian des tokens d’API (copie l’adresse dans ton navigateur) :</span>
        </label>
        <Commande texte={PAGE_TOKENS} />
      </div>
      {etat.erreur && <p className="erreur-connexion">{etat.erreur}</p>}
      <div className="boutons">
        {p.email && (
          <button className="discret" onClick={() => void oublier()}>
            Oublier
          </button>
        )}
        <button className="principal" disabled={!valide} onClick={() => void connecter()}>
          {etat.enCours ? 'Vérification…' : 'Se connecter'}
        </button>
      </div>
    </div>
  )
}

/** Le script lancé au démarrage de Windows tourne encore : deux synchros écriraient la même base. */
function ScriptAuDemarrage() {
  const [erreur, setErreur] = useState<string | null>(null)
  const retirer = () =>
    void retirerScriptAuDemarrage().then(verifierScriptAuDemarrage, (e: unknown) => setErreur(String(e)))
  return (
    <div className="script-demarrage">
      <span>
        Le script de synchro se lance aussi à l’ouverture de session Windows : l’app synchronise maintenant elle-même, les deux écriraient la
        même base.
      </span>
      <button className="discret" onClick={retirer}>
        Retirer le lancement au démarrage
      </button>
      {erreur && <span className="erreur-connexion">{erreur}</span>}
    </div>
  )
}

/** Une commande à taper, avec de quoi la copier. */
function Commande({ texte }: { texte: string }) {
  const [copiee, setCopiee] = useState(false)
  const copier = () =>
    void navigator.clipboard.writeText(texte).then(
      () => setCopiee(true),
      () => undefined,
    )
  return (
    <div className="commande">
      <code>{texte}</code>
      <button className="discret" onClick={copier} title="Copier la commande" aria-label={`Copier : ${texte}`}>
        <Icone de={copiee ? Check : Copy} />
      </button>
    </div>
  )
}

/** Comment lancer le script : le télécharger, le lancer, ou l'installer au démarrage de Windows. */
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
      <p>Dans un terminal ouvert dans le dossier du script, en remplaçant le chemin par celui du dossier de l’espace :</p>
      <Commande texte={'node .\\mdbase-jira.mjs "C:\\chemin\\vers\\espace" --suivre'} />
      <p>Pour qu’il se lance tout seul à chaque ouverture de session Windows (une fois pour toutes, sans droits administrateur) :</p>
      <Commande texte={'node .\\mdbase-jira.mjs "C:\\chemin\\vers\\espace" --demarrage'} />
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
      <p className="discret aide-source">
        {BUREAU ? 'La prochaine synchro relira tous les tickets avec ces réglages.' : 'Le script relit ces réglages à son prochain passage, et relit alors tous les tickets.'}
      </p>
      <div className="boutons">
        <button className="discret" onClick={p.fermer}>
          Annuler
        </button>
        <button
          className="principal"
          disabled={!valide}
          onClick={() => {
            void lancer(p.espace.modifierSource(p.base, suivante)).then(() => BUREAU && synchroniserJiraMaintenant())
            p.fermer()
          }}
        >
          Enregistrer
        </button>
      </div>
    </Flottant>
  )
}
