import { MARQUE_DEMO, memoriserDossier } from './dossier-memorise'

// Espace de démonstration « sans installation » : la démo du dépôt est copiée
// dans le stockage privé du navigateur (OPFS), qui offre la même API de
// fichiers qu'un dossier choisi sur le disque. Rien ne quitte le navigateur.

const PREFIXE = '../../../exemples/espace-demo/'
const FICHIERS = import.meta.glob('../../../exemples/espace-demo/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const NOM = 'Espace de démo'

async function racine() {
  return navigator.storage.getDirectory()
}

export async function demoExiste(): Promise<boolean> {
  try {
    await (await racine()).getDirectoryHandle(NOM)
    return true
  } catch {
    return false
  }
}

/** Ouvre la démo du navigateur ; la crée (ou la recrée si `neuve`) à partir de celle du dépôt. */
export async function ouvrirDemo(neuve: boolean): Promise<FileSystemDirectoryHandle> {
  const r = await racine()
  if (neuve) await r.removeEntry(NOM, { recursive: true }).catch(() => undefined)
  const existait = !neuve && (await demoExiste())
  const dossier = await r.getDirectoryHandle(NOM, { create: true })
  if (!existait) {
    for (const [source, texte] of Object.entries(FICHIERS)) {
      const segments = source.slice(PREFIXE.length).split('/')
      let d = dossier
      for (const s of segments.slice(0, -1)) d = await d.getDirectoryHandle(s, { create: true })
      const flux = await (await d.getFileHandle(segments.at(-1)!, { create: true })).createWritable()
      await flux.write(texte)
      await flux.close()
    }
  }
  await memoriserDossier(MARQUE_DEMO)
  return dossier
}
