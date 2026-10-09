import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AdaptateurFsa } from '../adapters/fsa/adaptateur-fsa'
import {
  choisirDossier,
  demanderPermission,
  MARQUE_DEMO,
  navigateurCompatible,
  retrouverDossier,
} from '../adapters/fsa/dossier-memorise'
import { demoExiste, ouvrirDemo } from '../adapters/fsa/demo'
import { AdaptateurBureau, choisirDossierBureau, dossierMemorise, estBureau, nomDossier, surveillerEspace } from '../adapters/tauri/bureau'
import type { AdaptateurFichiers } from '../core/fichiers'
import { useAujourdhui } from './useAujourdhui'
import { aleatoire, aujourdhui, maintenant, planifier } from '../adapters/navigateur'
import { DepotEspace } from '../core/depot-espace'
import { FournisseurActions, useLancer } from './actions'
import { BarreLaterale } from './BarreLaterale'
import { ContexteEspace, ContexteOuvrir } from './contexte-espace'
import { VueBase } from './VueBase'
import { VueDashboard } from './Dashboard'
import { RechercheGlobale } from './RechercheGlobale'
import { FenetreReglagesIA, IndicateurIA, PanneauAssistant } from './Assistant'
import { SessionAssistant } from './sessionAssistant'
import { enregistrerReglages, lireReglages, type ReglagesIA } from '../adapters/ia/reglages'
import { estChampDeSaisie } from './clavier'
import { BasculeMode, BasculePleinEcran, ContexteMode, useModeMemorise, usePleinEcran } from './mode'
import { AideRaccourcis } from './Raccourcis'
import { ToutesLesTaches } from './Taches'
import { PanneauInbox, useInbox } from './Inbox'
import { PanneauDocuments, useDocuments, type OngletDocuments } from './Documents'
import { FenetreModules, useModules } from './modules'
import { useSynchroJiraBureau } from './synchroJira'
import { getVersion } from '@tauri-apps/api/app'
import { ecouterMcp } from '../adapters/tauri/mcp'
import { serveurMcp } from '../core/ia/mcp'

export type Selection = { type: 'base' | 'dashboard'; id: string } | { type: 'taches' }

type Etat =
  | { type: 'incompatible' }
  | { type: 'chargement' }
  | { type: 'aucun' }
  | { type: 'permission'; handle: FileSystemDirectoryHandle }
  | { type: 'ouvert'; nom: string; espace: DepotEspace }

/** App de bureau (spec §17) : dossier choisi et surveillé par le natif, sans File System Access. */
const BUREAU = estBureau()

export function App() {
  const [etat, setEtat] = useState<Etat>(() =>
    BUREAU || navigateurCompatible() ? { type: 'chargement' } : { type: 'incompatible' },
  )
  const [erreur, setErreur] = useState<string | null>(null)
  const [avecDemo, setAvecDemo] = useState(false)
  useEffect(() => {
    void demoExiste().then(setAvecDemo)
  }, [])

  async function ouvrirAvec(adaptateur: AdaptateurFichiers, nom: string) {
    const espace = await DepotEspace.ouvrir(adaptateur, { aleatoire, planifier, aujourdhui, maintenant })
    setEtat({ type: 'ouvert', nom, espace })
  }
  const ouvrir = (handle: FileSystemDirectoryHandle) => ouvrirAvec(new AdaptateurFsa(handle), handle.name)
  const ouvrirBureau = (chemin: string) => ouvrirAvec(new AdaptateurBureau(), nomDossier(chemin))

  async function tenter(action: () => Promise<void>) {
    setErreur(null)
    try {
      await action()
    } catch (e) {
      // Fermer le sélecteur de dossier n'est pas une erreur.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (etat.type !== 'chargement') return
    void tenter(async () => {
      if (BUREAU) {
        const chemin = await dossierMemorise()
        return chemin ? ouvrirBureau(chemin) : setEtat({ type: 'aucun' })
      }
      const memorise = await retrouverDossier()
      if (!memorise) setEtat({ type: 'aucun' })
      else if (memorise === MARQUE_DEMO) {
        if (await demoExiste()) await ouvrir(await ouvrirDemo(false))
        else setEtat({ type: 'aucun' })
      } else if (memorise.autorise) await ouvrir(memorise.handle)
      else setEtat({ type: 'permission', handle: memorise.handle })
    })
  }, [etat.type])

  // Écrire ce qui est en attente dès que l'onglet passe en arrière-plan ou se ferme.
  useEffect(() => {
    if (etat.type !== 'ouvert') return
    const vider = () => {
      if (document.visibilityState === 'hidden') void etat.espace.vider()
    }
    document.addEventListener('visibilitychange', vider)
    return () => document.removeEventListener('visibilitychange', vider)
  }, [etat])

  // Les formules avec aujourdhui() changent de valeur avec le jour (spec §6).
  const jour = useAujourdhui()
  useEffect(() => {
    if (etat.type === 'ouvert') etat.espace.recalculer()
  }, [jour, etat])

  const choisir = () =>
    tenter(async () => {
      if (!BUREAU) return ouvrir(await choisirDossier())
      const chemin = await choisirDossierBureau()
      if (chemin) await ouvrirBureau(chemin)
    })
  // Refusée sans fenêtre quand le navigateur bloque la demande (refus ou fenêtres ignorées) : on le dit.
  const [refus, setRefus] = useState(false)
  const rouvrir = (handle: FileSystemDirectoryHandle) =>
    tenter(async () => {
      setRefus(false)
      if (await demanderPermission(handle)) await ouvrir(handle)
      else setRefus(true)
    })
  const demo = (neuve: boolean) => tenter(async () => ouvrir(await ouvrirDemo(neuve)))

  if (etat.type === 'ouvert') {
    return (
      <FournisseurActions>
        <Espace nom={etat.nom} espace={etat.espace} changer={choisir} surveiller={BUREAU ? surveillerEspace : undefined} />
      </FournisseurActions>
    )
  }

  return (
    <main className="accueil">
      {etat.type === 'incompatible' && (
        <p>
          Ce navigateur ne permet pas d'ouvrir un dossier local. Utilise <strong>Chrome</strong> ou{' '}
          <strong>Edge</strong>.
        </p>
      )}
      {(etat.type === 'aucun' || etat.type === 'permission') && (
        <>
          <h1 className="titre-accueil">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={38} height={48} />
            mdbase
          </h1>
          <p>
            Des bases de données comme dans Notion, rangées dans un dossier de fichiers Markdown que tu gardes. Rien n'est envoyé nulle part, sauf si tu actives l'assistant IA.
          </p>
          <div className="choix-accueil">
            {etat.type === 'permission' && (
              <div>
                <button className="principal" onClick={() => rouvrir(etat.handle)}>
                  Rouvrir « {etat.handle.name} »
                </button>
                <p className="discret">Le dernier dossier ouvert : le navigateur redemande l'autorisation à chaque visite.</p>
                {refus && (
                  <p className="erreur">
                    Le navigateur n'a pas donné l'accès à « {etat.handle.name} » (il bloque la demande après quelques refus). Choisis le
                    dossier avec « Ouvrir un autre dossier », ou autorise-le depuis l'icône à gauche de l'adresse.
                  </p>
                )}
              </div>
            )}
            <div>
              <div className="boutons-accueil">
                <button className={etat.type === 'aucun' ? 'principal' : ''} onClick={() => demo(false)}>
                  {avecDemo ? 'Reprendre la démo' : 'Essayer avec la démo'}
                </button>
                {avecDemo && (
                  <button className="discret" onClick={() => demo(true)}>
                    Repartir d’une démo neuve
                  </button>
                )}
              </div>
              <p className="discret">Rien à installer ni à choisir : un espace d'exemple, gardé dans le stockage de ce navigateur.</p>
            </div>
            <div>
              <button onClick={choisir}>{etat.type === 'permission' ? 'Ouvrir un autre dossier' : 'Ouvrir un dossier'}</button>
              <p className="discret">Pour tes vraies données : un dossier de ton disque, lu et modifié sur place.</p>
            </div>
          </div>
        </>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </main>
  )
}

type ProprietesEspace = {
  nom: string
  espace: DepotEspace
  changer: () => void
  /** Prévient d'un changement des fichiers sur le disque (app de bureau) ; sinon, relecture au retour sur la fenêtre seulement. */
  surveiller?: (rappel: () => void) => () => void
}

function Espace({ nom, espace, changer, surveiller }: ProprietesEspace) {
  const etat = useSyncExternalStore(espace.abonner, espace.etat)
  // Base ou dashboard affiché dans la zone principale.
  const [selection, setSelection] = useState<Selection | null>(() => {
    const premiere = etat.groupes.flatMap((g) => g.bases)[0] ?? etat.horsGroupe[0]
    return premiere ? { type: 'base', id: premiere } : null
  })
  const choisie = selection?.type === 'base' ? selection.id : null
  const base = choisie ? etat.bases.get(choisie) : undefined
  const dashboard = selection?.type === 'dashboard' ? etat.dashboards.find((d) => d.id === selection.id) : undefined
  const choisir = (id: string) => {
    setSelection({ type: 'base', id })
    setPageDemandee(null) // une demande de page ne survit pas à un changement de base
  }
  const [recherche, setRecherche] = useState(false)
  // Assistant IA : désactivé par défaut, la première ouverture montre l'avertissement (spec §12).
  const [reglagesIA, setReglagesIA] = useState(lireReglages)
  const [reglerIA, setReglerIA] = useState(false)
  // Un seul panneau à droite à la fois : l'assistant ou l'inbox (spec §18).
  const [panneau, setPanneau] = useState<'ia' | 'inbox' | 'documents' | null>(null)
  const [ongletDocuments, setOngletDocuments] = useState<OngletDocuments>('documents')
  const panneauIA = panneau === 'ia'
  const [fenetreModules, setFenetreModules] = useState(false)
  const modules = useModules(etat)
  useSynchroJiraBureau(espace, BUREAU && modules.jira)
  // Claude (MCP) : l'app répond aux messages relayés par `mdbase --mcp`, sur l'espace ouvert.
  useEffect(() => {
    if (!modules.mcp) return
    let arret: (() => void) | null = null
    let fini = false
    void getVersion().then((version) => {
      if (fini) return
      arret = ecouterMcp(serveurMcp(espace, { version, aujourdhui }))
    })
    return () => {
      fini = true
      arret?.()
    }
  }, [espace, modules.mcp])

  // La conversation vit ici, pas dans le panneau : le fermer n'arrête pas une demande en cours.
  const sessionIA = useMemo(() => new SessionAssistant(espace, nom), [espace, nom])
  useEffect(() => () => sessionIA.arreter(), [sessionIA])
  const inbox = useInbox(espace, sessionIA)
  const documents = useDocuments(espace, sessionIA)
  /** Ctrl+J et le bouton de la barre latérale : ouvre ou ferme le panneau (ou l'activation, la première fois). */
  const basculerAssistant = useCallback(() => {
    if (lireReglages().actif) setPanneau((o) => (o === 'ia' ? null : 'ia'))
    else setReglerIA(true)
  }, [])
  const enregistrerIA = (r: ReglagesIA) => {
    enregistrerReglages(r)
    setReglagesIA(r)
    setReglerIA(false)
    setPanneau(r.actif ? 'ia' : null)
  }

  // Changements faits ailleurs (synchro, autre machine) : le navigateur ne voit
  // pas le dossier changer, on le relit au retour sur l'onglet (spec §12).
  const lancer = useLancer()
  const enCours = useRef(false)
  const [relu, setRelu] = useState<{ enCours: boolean; a: Date | null }>({ enCours: false, a: null })
  const rafraichir = useCallback(() => {
    if (enCours.current) return
    enCours.current = true
    setRelu((r) => ({ ...r, enCours: true }))
    void lancer(espace.rafraichir()).finally(() => {
      enCours.current = false
      setRelu({ enCours: false, a: new Date() })
    })
  }, [espace, lancer])
  // App de bureau : relecture à chaque changement sur le disque, sans l'indicateur de la barre latérale
  // (nos propres écritures en déclenchent aussi). Un changement pendant une relecture en relance une après.
  const surveillance = useRef({ enCours: false, encore: false })
  const relireEnSilence = useCallback(() => {
    const s = surveillance.current
    if (s.enCours) return void (s.encore = true)
    s.enCours = true
    void lancer(espace.rafraichir()).finally(() => {
      s.enCours = false
      if (s.encore) {
        s.encore = false
        relireEnSilence()
      }
    })
  }, [espace, lancer])
  useEffect(() => {
    const retour = () => {
      if (document.visibilityState === 'visible') rafraichir()
    }
    document.addEventListener('visibilitychange', retour)
    window.addEventListener('focus', retour)
    return () => {
      document.removeEventListener('visibilitychange', retour)
      window.removeEventListener('focus', retour)
    }
  }, [rafraichir])
  useEffect(() => surveiller?.(relireEnSilence), [surveiller, relireEnSilence])
  const [pageDemandee, setPageDemandee] = useState<{ base: string; id: string; jeton: number } | null>(null)
  const [consultation, basculerMode] = useModeMemorise()
  const [pleinEcran, basculerPleinEcran] = usePleinEcran()

  // Ctrl+K / ⌘K ouvre la recherche globale depuis n'importe où (spec §11) ; Ctrl+J / ⌘J, l'assistant IA
  // (pas en consultation) ; Ctrl+E / ⌘E bascule entre consultation et édition, comme Obsidian.
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const touche = e.key.toLowerCase()
      // Déjà pris par l'éditeur (Ctrl+K sur une sélection : un lien).
      if (touche === 'k') {
        if (e.defaultPrevented) return
        e.preventDefault()
        setRecherche(true)
      } else if (touche === 'j' && !consultation) {
        e.preventDefault()
        basculerAssistant()
      } else if (touche === 'e' && !estChampDeSaisie(e.target)) {
        e.preventDefault()
        basculerMode()
      }
    }
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  }, [basculerAssistant, consultation, basculerMode])
  // En consultation, le panneau de l'assistant se referme : il n'a rien à y faire (une demande en cours continue).
  useEffect(() => {
    if (consultation) {
      setPanneau(null)
      setReglerIA(false)
    }
  }, [consultation])
  // Ctrl+Z / ⌘Z annule la dernière modification des données, Ctrl+Maj+Z (ou Ctrl+Y) la rétablit.
  // Dans un champ en cours de saisie, c'est l'annulation native du champ qui joue.
  const [annonce, setAnnonce] = useState<string | null>(null)
  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | undefined
    const clavier = (e: KeyboardEvent) => {
      if (consultation || !(e.metaKey || e.ctrlKey) || e.altKey || estChampDeSaisie(e.target)) return
      const touche = e.key.toLowerCase()
      const retablir = touche === 'y' || (touche === 'z' && e.shiftKey)
      if (touche !== 'z' && !retablir) return
      e.preventDefault()
      void lancer(retablir ? espace.retablir() : espace.annuler()).then((fait) => {
        setAnnonce(fait ? (retablir ? 'Modification rétablie' : 'Modification annulée') : retablir ? 'Rien à rétablir' : 'Rien à annuler')
        clearTimeout(minuterie)
        minuterie = setTimeout(() => setAnnonce(null), 1600)
      })
    }
    document.addEventListener('keydown', clavier)
    return () => {
      document.removeEventListener('keydown', clavier)
      clearTimeout(minuterie)
    }
  }, [espace, lancer, consultation])
  const ouvrirResultat = (base: string, id: string) => {
    setSelection({ type: 'base', id: base })
    setPageDemandee((d) => ({ base, id, jeton: (d?.jeton ?? 0) + 1 }))
  }

  return (
    <ContexteEspace.Provider value={{ espace, etat }}>
      <ContexteOuvrir.Provider value={ouvrirResultat}>
      <ContexteMode.Provider value={consultation}>
        <div className={`espace ${consultation ? 'consultation' : ''} ${pleinEcran ? 'vue-plein-ecran' : ''}`}>
          <BarreLaterale
            espace={espace}
            etat={etat}
            nomEspace={nom}
            selection={selection}
            choisir={choisir}
            choisirDashboard={(id) => setSelection({ type: 'dashboard', id })}
            toutesLesTaches={() => setSelection({ type: 'taches' })}
            changerDossier={changer}
            chercher={() => setRecherche(true)}
            assistant={basculerAssistant}
            indicateurIA={panneauIA ? null : <IndicateurIA session={sessionIA} />}
            assistantActif={reglagesIA.actif}
            modules={modules}
            inbox={{ compte: inbox.attente.length, ouverte: panneau === 'inbox', basculer: () => setPanneau((o) => (o === 'inbox' ? null : 'inbox')) }}
            ouvrirModules={() => setFenetreModules(true)}
            documents={{
              compte: documents.documents.filter((d) => !d.remplacePar).length,
              ouverte: panneau === 'documents',
              basculer: () => {
                setOngletDocuments('documents')
                setPanneau((o) => (o === 'documents' ? null : 'documents'))
              },
            }}
            relire={rafraichir}
            relu={relu}
          />
          <main className="contenu">
            <div className="coin-contenu">
              <AideRaccourcis />
              <BasculePleinEcran actif={pleinEcran} basculer={basculerPleinEcran} />
              <BasculeMode consultation={consultation} basculer={basculerMode} />
            </div>
            {dashboard && <VueDashboard key={dashboard.id} espace={espace} etat={dashboard} allerABase={choisir} />}
            {selection?.type === 'taches' && <ToutesLesTaches ouvrir={ouvrirResultat} />}
            {!base && !dashboard && selection?.type !== 'taches' && <p className="discret">Aucune base : crée-en une dans la barre latérale.</p>}
            {base && !base.chargement.ok && (
              <p className="erreur">
                « {base.id} » n'est pas une base : {base.chargement.raison}
              </p>
            )}
            {base?.chargement.ok && base.depot && (
              <VueBase key={base.id} espace={espace} etat={base} depot={base.depot} chargement={base.chargement} pageDemandee={pageDemandee?.base === base.id ? pageDemandee : null} />
            )}
          </main>
          {panneauIA && reglagesIA.actif && !consultation && (
            <PanneauAssistant
              session={sessionIA}
              baseOuverte={choisie}
              reglages={reglagesIA}
              reglerIA={() => setReglerIA(true)}
              changerModele={(modele) => {
                const r = { ...reglagesIA, modele }
                enregistrerReglages(r)
                setReglagesIA(r)
              }}
              fermer={() => setPanneau(null)}
            />
          )}
          {panneau === 'documents' && modules.contexte && reglagesIA.actif && !consultation && (
            <PanneauDocuments espace={espace} {...documents} onglet={ongletDocuments} changerOnglet={setOngletDocuments} fermer={() => setPanneau(null)} />
          )}
          {panneau === 'inbox' && modules.inbox && !consultation && (
            <PanneauInbox
              espace={espace}
              inbox={inbox}
              occupe={sessionIA.enCours()}
              envoyer={
                reglagesIA.actif
                  ? (elements) => {
                      setPanneau('ia')
                      void sessionIA.traiterInbox({ reglages: reglagesIA, baseOuverte: choisie }, elements)
                    }
                  : undefined
              }
              fermer={() => setPanneau(null)}
            />
          )}
        </div>
        {fenetreModules && (
          <FenetreModules
            assistantActif={reglagesIA.actif}
            reglerAssistant={() => {
              setFenetreModules(false)
              setReglerIA(true)
            }}
            ouvrirContexte={() => {
              setFenetreModules(false)
              setOngletDocuments('contexte')
              setPanneau('documents')
            }}
            desactiverAssistant={() => {
              const r = { ...reglagesIA, actif: false }
              enregistrerReglages(r)
              setReglagesIA(r)
              setPanneau((o) => (o === 'ia' ? null : o))
            }}
            fermer={() => setFenetreModules(false)}
          />
        )}
        {reglerIA && <FenetreReglagesIA espace={espace} reglages={reglagesIA} enregistrer={enregistrerIA} fermer={() => setReglerIA(false)} />}
        {recherche && <RechercheGlobale espace={espace} etat={etat} ouvrir={ouvrirResultat} fermer={() => setRecherche(false)} />}
        {annonce && (
          <div className="bandeau-info" role="status">
            {annonce}
          </div>
        )}
      </ContexteMode.Provider>
      </ContexteOuvrir.Provider>
    </ContexteEspace.Provider>
  )
}
