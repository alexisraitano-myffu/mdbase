import { useEffect, useState, useSyncExternalStore } from 'react'
import { AdaptateurFsa } from '../adapters/fsa/adaptateur-fsa'
import {
  choisirDossier,
  demanderPermission,
  navigateurCompatible,
  retrouverDossier,
} from '../adapters/fsa/dossier-memorise'
import { aleatoire, planifier } from '../adapters/navigateur'
import type { ChargementBase } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { DepotEspace } from '../core/depot-espace'
import { FournisseurActions } from './actions'
import { BarreLaterale } from './BarreLaterale'
import { Tableau } from './Tableau'
import { useErreurDepot } from './useDepot'

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
    const espace = await DepotEspace.ouvrir(new AdaptateurFsa(handle), { aleatoire, planifier })
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
  const [choisie, setChoisie] = useState<string | null>(
    () => etat.groupes.flatMap((g) => g.bases)[0] ?? etat.horsGroupe[0] ?? null,
  )
  const base = choisie ? etat.bases.get(choisie) : undefined

  return (
    <div className="espace">
      <BarreLaterale
        espace={espace}
        etat={etat}
        nomEspace={nom}
        choisie={choisie}
        choisir={setChoisie}
        changerDossier={changer}
      />
      <main className="contenu">
        {!base && <p className="discret">Aucune base : crée-en une dans la barre latérale.</p>}
        {base && !base.chargement.ok && (
          <p className="erreur">
            « {base.id} » n'est pas une base : {base.chargement.raison}
          </p>
        )}
        {base?.chargement.ok && base.depot && (
          <VueBase key={base.id} espace={espace} id={base.id} depot={base.depot} chargement={base.chargement} />
        )}
      </main>
    </div>
  )
}

function VueBase(p: {
  espace: DepotEspace
  id: string
  depot: DepotBase
  chargement: Extract<ChargementBase, { ok: true }>
}) {
  const { espace, id, depot, chargement } = p
  const erreur = useErreurDepot(depot)
  const { nonReconnus, avertissements } = chargement.base
  const signalements = [...avertissements, ...nonReconnus.map((f) => `${f.chemin} : ${f.raison}`)]
  return (
    <>
      <h1>{depot.schema.nom}</h1>
      {erreur && <p className="erreur">Écriture impossible : {erreur}</p>}
      {signalements.length > 0 && (
        <details className="avertissements">
          <summary>
            ⚠ {signalements.length} signalement{signalements.length > 1 ? 's' : ''}
          </summary>
          <ul>
            {signalements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      <Tableau espace={espace} base={id} depot={depot} />
    </>
  )
}
