import { execFile } from 'node:child_process'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

// Garde de l'e-mail et du token Jira (§16), toujours hors de l'espace :
// - Windows : token chiffré pour la session par DPAPI (ConvertFrom-SecureString),
//   lisible seulement par ce compte sur ce poste, sans droits admin ;
// - macOS : trousseau de session (commande `security`) ;
// - ailleurs : fichier lisible par le seul utilisateur.
// Le secret passe par une variable d'environnement du processus enfant, jamais
// par sa ligne de commande (visible des autres processus).

const executer = promisify(execFile)
const SERVICE = 'mdbase-jira'

export type Identifiants = { email: string; token: string }

function dossier(): string {
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'mdbase')
  return join(homedir(), '.config', 'mdbase')
}

const fichier = () => join(dossier(), 'jira.json')

async function powershell(script: string, env: Record<string, string>): Promise<string> {
  const { stdout } = await executer('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env }, windowsHide: true })
  return stdout.trim()
}

export async function lireIdentifiants(site: string): Promise<Identifiants | null> {
  let brut: { [site: string]: { email: string; token?: string; chiffre?: string } }
  try {
    brut = JSON.parse(await readFile(fichier(), 'utf8'))
  } catch {
    return null
  }
  const e = brut[site]
  if (!e?.email) return null
  try {
    if (platform() === 'win32' && e.chiffre) {
      const token = await powershell('$s = ConvertTo-SecureString $env:MDBASE_CHIFFRE; [System.Net.NetworkCredential]::new("", $s).Password', { MDBASE_CHIFFRE: e.chiffre })
      return token ? { email: e.email, token } : null
    }
    if (platform() === 'darwin') {
      const { stdout } = await executer('security', ['find-generic-password', '-s', SERVICE, '-a', `${site}:${e.email}`, '-w'])
      return { email: e.email, token: stdout.trim() }
    }
    return e.token ? { email: e.email, token: e.token } : null
  } catch {
    return null
  }
}

export async function garderIdentifiants(site: string, id: Identifiants): Promise<void> {
  await mkdir(dossier(), { recursive: true })
  let brut: Record<string, unknown> = {}
  try {
    brut = JSON.parse(await readFile(fichier(), 'utf8'))
  } catch {
    // premier enregistrement
  }
  if (platform() === 'win32') {
    const chiffre = await powershell('ConvertFrom-SecureString (ConvertTo-SecureString $env:MDBASE_SECRET -AsPlainText -Force)', { MDBASE_SECRET: id.token })
    brut[site] = { email: id.email, chiffre }
  } else if (platform() === 'darwin') {
    await executer('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', `${site}:${id.email}`, '-w', id.token])
    brut[site] = { email: id.email }
  } else {
    brut[site] = { email: id.email, token: id.token }
  }
  await writeFile(fichier(), JSON.stringify(brut, null, 2), { encoding: 'utf8', mode: 0o600 })
  await chmod(fichier(), 0o600).catch(() => undefined)
}

/** Efface tout ce que le script a gardé (fichier, et entrées du trousseau sur macOS). */
export async function oublierIdentifiants(): Promise<string> {
  if (platform() === 'darwin') {
    try {
      const brut = JSON.parse(await readFile(fichier(), 'utf8')) as Record<string, { email: string }>
      for (const [site, e] of Object.entries(brut)) await executer('security', ['delete-generic-password', '-s', SERVICE, '-a', `${site}:${e.email}`]).catch(() => undefined)
    } catch {
      // rien de gardé
    }
  }
  await rm(fichier(), { force: true })
  return fichier()
}
