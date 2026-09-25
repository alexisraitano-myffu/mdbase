// Mémorise le dossier de l'espace dans IndexedDB (spec §12) : à la réouverture,
// seule la permission est redemandée, pas le choix du dossier.

const BASE = 'mdbase'
const MAGASIN = 'dossiers'
const CLE = 'espace'

export function navigateurCompatible(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export type DossierMemorise = { handle: FileSystemDirectoryHandle; autorise: boolean }

/**
 * La démo (dossier OPFS) est mémorisée par cette marque, pas par son handle :
 * relire un handle OPFS depuis IndexedDB fait planter Chromium en navigation
 * privée. Elle se retrouve par `navigator.storage.getDirectory()`.
 */
export const MARQUE_DEMO = 'demo'

export async function retrouverDossier(): Promise<DossierMemorise | typeof MARQUE_DEMO | null> {
  const handle = await transaction<FileSystemDirectoryHandle | typeof MARQUE_DEMO | undefined>('readonly', (m) => m.get(CLE))
  if (!handle) return null
  if (handle === MARQUE_DEMO) return MARQUE_DEMO
  const autorise = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  return { handle, autorise }
}

/** Doit être appelé depuis un geste utilisateur (clic). */
export async function choisirDossier(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await memoriserDossier(handle)
  return handle
}

/** Retient le dossier pour la prochaine ouverture de l'app. */
export async function memoriserDossier(handle: FileSystemDirectoryHandle | typeof MARQUE_DEMO): Promise<void> {
  await transaction('readwrite', (m) => m.put(handle, CLE))
}

/** Doit être appelé depuis un geste utilisateur (clic). */
export async function demanderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

function transaction<T>(mode: IDBTransactionMode, action: (m: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    const ouverture = indexedDB.open(BASE, 1)
    ouverture.onupgradeneeded = () => ouverture.result.createObjectStore(MAGASIN)
    ouverture.onerror = () => rejeter(ouverture.error)
    ouverture.onsuccess = () => {
      const db = ouverture.result
      const requete = action(db.transaction(MAGASIN, mode).objectStore(MAGASIN))
      requete.onsuccess = () => {
        resoudre(requete.result as T)
        db.close()
      }
      requete.onerror = () => {
        rejeter(requete.error)
        db.close()
      }
    }
  })
}
