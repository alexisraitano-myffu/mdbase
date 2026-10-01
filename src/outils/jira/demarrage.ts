import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

// Lancement de la synchro à l'ouverture de la session Windows (§16) : un .cmd
// dans le dossier Démarrage de l'utilisateur, sans droits administrateur. Le
// script est d'abord copié hors des Téléchargements, pour qu'un ménage dans ce
// dossier ne casse pas le lancement ; relancer l'installation le met à jour.

const NOM_CMD = 'mdbase-jira.cmd'

function dossierDemarrage(): string {
  const appdata = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  return join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
}

function copieDuScript(): string {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(local, 'mdbase', 'mdbase-jira.mjs')
}

/** Dans un .cmd, `%` se double et le texte passe en UTF-8 (chemins OneDrive accentués). */
export function texteCmd(node: string, script: string, espace: string, intervalle: number): string {
  const q = (s: string) => `"${s.replace(/%/g, '%%')}"`
  return [
    '@echo off',
    'chcp 65001 >nul',
    'rem Synchro Jira de mdbase, installee par "mdbase-jira.mjs --demarrage".',
    'rem Supprimer ce fichier arrete le lancement automatique.',
    `start "mdbase Jira" /min ${q(node)} ${q(script)} ${q(espace)} --suivre${intervalle !== 5 ? ` --intervalle ${intervalle}` : ''}`,
    '',
  ].join('\r\n')
}

/** Installe le lancement au démarrage ; renvoie le fichier .cmd et la copie du script. */
export async function installerDemarrage(scriptActuel: string, espace: string, intervalle: number): Promise<{ cmd: string; script: string }> {
  if (platform() !== 'win32') throw new Error('le lancement au démarrage ne s’installe que sous Windows')
  const script = copieDuScript()
  await mkdir(join(script, '..'), { recursive: true })
  if (scriptActuel.toLowerCase() !== script.toLowerCase()) await copyFile(scriptActuel, script)
  const cmd = join(dossierDemarrage(), NOM_CMD)
  await writeFile(cmd, texteCmd(process.execPath, script, espace, intervalle), 'utf8')
  return { cmd, script }
}

export async function retirerDemarrage(): Promise<string> {
  const cmd = join(dossierDemarrage(), NOM_CMD)
  await rm(cmd, { force: true })
  return cmd
}
