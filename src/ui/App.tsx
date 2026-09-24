import { useEffect, useState } from 'react'
import { AdaptateurFsa } from '../adapters/fsa/adaptateur-fsa'
import {
  choisirDossier,
  demanderPermission,
  navigateurCompatible,
  retrouverDossier,
} from '../adapters/fsa/dossier-memorise'
import { aleatoire, planifier } from '../adapters/navigateur'
import { chargerBase, type ChargementBase } from '../core/base'
import { DepotBase } from '../core/depot-base'
import { listerBases } from '../core/espace'
import { Tableau } from './Tableau'
import { useErreurDepot } from './useDepot'

type BaseOuverte = { id: string; chargement: ChargementBase; depot: DepotBase | null }

type Etat =
  | { type: 'incompatible' }
  | { type: 'chargement' }
  | { type: 'aucun' }
  | { type: 'permission'; handle: FileSystemDirectoryHandle }
  | { type: 'ouvert'; handle: FileSystemDirectoryHandle; bases: BaseOuverte[] }

export function App() {
  const [etat, setEtat] = useState<Etat>(() =>
    navigateurCompatible() ? { type: 'chargement' } : { type: 'incompatible' },
  )
  const [erreur, setErreur] = useState<string | null>(null)

  async function ouvrir(handle: FileSystemDirectoryHandle) {
    const adaptateur = new AdaptateurFsa(handle)
    const bases = await Promise.all(
      (await listerBases(adaptateur)).map(async (id): Promise<BaseOuverte> => {
        const chargement = await chargerBase(adaptateur, id)
        const depot = chargement.ok
          ? new DepotBase(adaptateur, chargement.base.schema, chargement.base.lignes, { aleatoire, planifier })
          : null
        return { id, chargement, depot }
      }),
    )
    setEtat({ type: 'ouvert', handle, bases })
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
      if (document.visibilityState === 'hidden') for (const b of etat.bases) void b.depot?.vider()
    }
    document.addEventListener('visibilitychange', vider)
    return () => document.removeEventListener('visibilitychange', vider)
  }, [etat])

  const choisir = () => tenter(async () => ouvrir(await choisirDossier()))

  if (etat.type === 'ouvert') return <Espace nom={etat.handle.name} bases={etat.bases} changer={choisir} />

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

function Espace({ nom, bases, changer }: { nom: string; bases: BaseOuverte[]; changer: () => void }) {
  const [choisie, setChoisie] = useState(bases[0]?.id ?? null)
  const base = bases.find((b) => b.id === choisie)

  return (
    <div className="espace">
      <nav className="barre-laterale">
        <div className="nom-espace">{nom}</div>
        {bases.map((b) => (
          <button
            key={b.id}
            className={`entree-base ${b.id === choisie ? 'active' : ''}`}
            onClick={() => setChoisie(b.id)}
          >
            {b.chargement.ok ? b.chargement.base.schema.nom : b.id}
          </button>
        ))}
        <button className="discret changer" onClick={changer}>
          Changer de dossier
        </button>
      </nav>
      <main className="contenu">
        {!base && <p className="discret">Aucune base dans ce dossier.</p>}
        {base && !base.chargement.ok && (
          <p className="erreur">
            « {base.id} » n'est pas une base : {base.chargement.raison}
          </p>
        )}
        {base?.chargement.ok && base.depot && (
          <VueBase key={base.id} depot={base.depot} chargement={base.chargement} />
        )}
      </main>
    </div>
  )
}

function VueBase({ depot, chargement }: { depot: DepotBase; chargement: Extract<ChargementBase, { ok: true }> }) {
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
      <Tableau depot={depot} />
    </>
  )
}
