import { useEffect, useState, useSyncExternalStore } from 'react'
import { AdaptateurFsa } from '../adapters/fsa/adaptateur-fsa'
import {
  choisirDossier,
  demanderPermission,
  navigateurCompatible,
  retrouverDossier,
} from '../adapters/fsa/dossier-memorise'
import { useAujourdhui } from './useAujourdhui'
import { aleatoire, aujourdhui, maintenant, planifier } from '../adapters/navigateur'
import { DepotEspace } from '../core/depot-espace'
import { FournisseurActions } from './actions'
import { BarreLaterale } from './BarreLaterale'
import { ContexteEspace } from './contexte-espace'
import { VueBase } from './VueBase'
import { VueDashboard } from './Dashboard'

export type Selection = { type: 'base' | 'dashboard'; id: string }

type Etat =
  | { type: 'incompatible' }
  | { type: 'chargement' }
  | { type: 'aucun' }
  | { type: 'permission'; handle: FileSystemDirectoryHandle }
  | { type: 'ouvert'; handle: FileSystemDirectoryHandle; espace: DepotEspace }

export function App() {
  const [etat, setEtat] = useState<Etat>(() =>
    navigateurCompatible() ? { type: 'chargement' } : { type: 'incompatible' },
  )
  const [erreur, setErreur] = useState<string | null>(null)

  async function ouvrir(handle: FileSystemDirectoryHandle) {
    const espace = await DepotEspace.ouvrir(new AdaptateurFsa(handle), { aleatoire, planifier, aujourdhui, maintenant })
    setEtat({ type: 'ouvert', handle, espace })
  }

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
      const memorise = await retrouverDossier()
      if (!memorise) setEtat({ type: 'aucun' })
      else if (memorise.autorise) await ouvrir(memorise.handle)
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

  const choisir = () => tenter(async () => ouvrir(await choisirDossier()))

  if (etat.type === 'ouvert') {
    return (
      <FournisseurActions>
        <Espace nom={etat.handle.name} espace={etat.espace} changer={choisir} />
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
      {etat.type === 'aucun' && <button onClick={choisir}>Ouvrir un dossier</button>}
      {etat.type === 'permission' && (
        <>
          <button
            onClick={() =>
              tenter(async () => {
                if (await demanderPermission(etat.handle)) await ouvrir(etat.handle)
              })
            }
          >
            Rouvrir « {etat.handle.name} »
          </button>
          <button className="discret" onClick={choisir}>
            Choisir un autre dossier
          </button>
        </>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </main>
  )
}

function Espace({ nom, espace, changer }: { nom: string; espace: DepotEspace; changer: () => void }) {
  const etat = useSyncExternalStore(espace.abonner, espace.etat)
  // Base ou dashboard affiché dans la zone principale.
  const [selection, setSelection] = useState<Selection | null>(() => {
    const premiere = etat.groupes.flatMap((g) => g.bases)[0] ?? etat.horsGroupe[0]
    return premiere ? { type: 'base', id: premiere } : null
  })
  const choisie = selection?.type === 'base' ? selection.id : null
  const base = choisie ? etat.bases.get(choisie) : undefined
  const dashboard = selection?.type === 'dashboard' ? etat.dashboards.find((d) => d.id === selection.id) : undefined
  const choisir = (id: string) => setSelection({ type: 'base', id })

  return (
    <ContexteEspace.Provider value={{ espace, etat }}>
      <div className="espace">
        <BarreLaterale
          espace={espace}
          etat={etat}
          nomEspace={nom}
          selection={selection}
          choisir={choisir}
          choisirDashboard={(id) => setSelection({ type: 'dashboard', id })}
          changerDossier={changer}
        />
        <main className="contenu">
          {dashboard && <VueDashboard key={dashboard.id} espace={espace} etat={dashboard} allerABase={choisir} />}
          {!base && !dashboard && <p className="discret">Aucune base : crée-en une dans la barre latérale.</p>}
          {base && !base.chargement.ok && (
            <p className="erreur">
              « {base.id} » n'est pas une base : {base.chargement.raison}
            </p>
          )}
          {base?.chargement.ok && base.depot && (
            <VueBase key={base.id} espace={espace} etat={base} depot={base.depot} chargement={base.chargement} />
          )}
        </main>
      </div>
    </ContexteEspace.Provider>
  )
}
