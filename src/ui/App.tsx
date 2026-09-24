import { useEffect, useState } from 'react'
import { AdaptateurFsa } from '../adapters/fsa/adaptateur-fsa'
import {
  choisirDossier,
  demanderPermission,
  navigateurCompatible,
  retrouverDossier,
} from '../adapters/fsa/dossier-memorise'
import { listerBases } from '../core/espace'

type Etat =
  | { type: 'incompatible' }
  | { type: 'chargement' }
  | { type: 'aucun' }
  | { type: 'permission'; handle: FileSystemDirectoryHandle }
  | { type: 'ouvert'; handle: FileSystemDirectoryHandle; bases: string[] }

export function App() {
  const [etat, setEtat] = useState<Etat>(() =>
    navigateurCompatible() ? { type: 'chargement' } : { type: 'incompatible' },
  )
  const [erreur, setErreur] = useState<string | null>(null)

  async function ouvrir(handle: FileSystemDirectoryHandle) {
    const bases = await listerBases(new AdaptateurFsa(handle))
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

  const choisir = () => tenter(async () => ouvrir(await choisirDossier()))

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
      {etat.type === 'ouvert' && (
        <>
          <h1>{etat.handle.name}</h1>
          {etat.bases.length === 0 ? (
            <p className="discret">Aucune base dans ce dossier.</p>
          ) : (
            <ul>
              {etat.bases.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <button className="discret" onClick={choisir}>
            Changer de dossier
          </button>
        </>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </main>
  )
}
