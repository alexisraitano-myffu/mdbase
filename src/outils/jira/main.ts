import { webcrypto } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { basesJira, synchroniser, type Bilan } from '../../core/jira/synchro'
import { clientHttp } from './client-http'
import { installerDemarrage, retirerDemarrage } from './demarrage'
import { AdaptateurNode } from './fichiers-node'
import { garderIdentifiants, lireIdentifiants, oublierIdentifiants, type Identifiants } from './secret'

// Script de synchro Jira de mdbase (§16) : lit Jira Cloud, écrit les tickets
// dans la base Jira de l'espace. Lecture seule côté Jira.
//
//   node mdbase-jira.mjs <dossier de l'espace> [--suivre] [--complete] [--intervalle 5]
//   node mdbase-jira.mjs <dossier de l'espace> --demarrage   (Windows : lancement à l'ouverture de session)
//   node mdbase-jira.mjs --oublier

const AIDE = `Synchro Jira de mdbase (lecture seule : rien n'est écrit dans Jira).

  node mdbase-jira.mjs "<dossier de l'espace>"            une synchro
  node mdbase-jira.mjs "<dossier de l'espace>" --suivre   reste ouvert, resynchronise toutes les 5 minutes
  node mdbase-jira.mjs "<dossier de l'espace>" --demarrage
                                                           Windows : lance la synchro à chaque ouverture de session
  node mdbase-jira.mjs --sans-demarrage                    retire ce lancement automatique
  node mdbase-jira.mjs --oublier                           efface l'e-mail et le token gardés sur ce poste

Options : --complete (tout relire), --intervalle <minutes>.
La base Jira se crée dans mdbase (« Nouvelle base Jira ») : site et projets suivis y sont réglés.`

const COMPLETE_TOUTES_LES = 60 * 60 * 1000

async function principal(args: string[]): Promise<number> {
  if (args.includes('--aide') || args.includes('-h') || args.includes('--help')) return (console.log(AIDE), 0)
  if (args.includes('--oublier')) return (console.log(`Identifiants effacés (${await oublierIdentifiants()}).`), 0)
  if (args.includes('--sans-demarrage')) return (console.log(`Lancement au démarrage retiré (${await retirerDemarrage()}).`), 0)

  const dossier = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--intervalle')
  if (!dossier) return (console.log(AIDE), 1)
  const racine = resolve(dossier)
  if (!(await stat(racine).catch(() => null))?.isDirectory()) return (console.error(`Dossier introuvable : ${racine}`), 1)
  const intervalle = Math.max(1, Number(args[args.indexOf('--intervalle') + 1]) || 5)
  const suivre = args.includes('--suivre')

  const a = new AdaptateurNode(racine)
  const aleatoire = (n: number) => webcrypto.getRandomValues(new Uint8Array(n))
  const identifiants = new Map<string, Identifiants>()
  let derniereComplete = 0

  const passe = async () => {
    const bases = await basesJira(a)
    if (bases.length === 0) {
      console.error('Aucune base Jira dans cet espace : crée-la dans mdbase (« Nouvelle base Jira »), puis relance.')
      return false
    }
    const complete = args.includes('--complete') || Date.now() - derniereComplete > COMPLETE_TOUTES_LES
    let ok = true
    for (const { id, schema } of bases) {
      const site = schema.source!.site
      try {
        if (!site) throw new Error(`site Jira manquant dans les réglages de la base « ${schema.nom} »`)
        let id_ = identifiants.get(site) ?? (await lireIdentifiants(site))
        if (!id_) id_ = await demander(site)
        identifiants.set(site, id_)
        const bilan = await synchroniser(a, id, clientHttp(site, id_.email, id_.token), { maintenant, aleatoire, complete })
        console.log(`${horodatage()}  ${schema.nom} : ${resume(bilan)}`)
      } catch (e) {
        ok = false
        console.error(`${horodatage()}  ${schema.nom} : ${(e as Error).message}`)
        // Token refusé : on l'oublie pour le redemander au prochain passage.
        if (/Jira : 401/.test((e as Error).message)) identifiants.delete(site)
      }
    }
    if (complete && ok) derniereComplete = Date.now()
    return ok
  }

  if (args.includes('--demarrage')) {
    // Un premier passage d'abord : il demande le token s'il manque, et prouve que tout marche.
    if (!(await passe())) return (console.error('Lancement au démarrage non installé : corrige d’abord l’erreur ci-dessus.'), 1)
    const { cmd, script } = await installerDemarrage(resolve(process.argv[1]!), racine, intervalle)
    console.log(`La synchro se lancera à chaque ouverture de session (fenêtre « mdbase Jira » réduite dans la barre des tâches).`)
    console.log(`  lanceur : ${cmd}`)
    console.log(`  script  : ${script} (copie gardée hors des Téléchargements)`)
    console.log('Pour la lancer dès maintenant, double-clique sur le lanceur ou ouvre une nouvelle session. Pour l’arrêter : --sans-demarrage.')
    return 0
  }
  if (!suivre) return (await passe()) ? 0 : 1
  console.log(`Synchro toutes les ${intervalle} min. Ctrl+C pour arrêter.`)
  for (;;) {
    await passe()
    await new Promise((ok) => setTimeout(ok, intervalle * 60 * 1000))
  }
}

async function demander(site: string): Promise<Identifiants> {
  if (!process.stdin.isTTY) throw new Error(`aucun token gardé pour ${site} : lance le script une fois dans un terminal pour le saisir`)
  console.log(`Première connexion à ${site}. L'e-mail et le token sont gardés sur ce poste, hors de l'espace.`)
  const email = (await question('E-mail Atlassian : ')).trim()
  const token = (await question('Token d’API (la saisie ne s’affiche pas) : ', true)).trim()
  if (!email || !token) throw new Error('e-mail ou token vide')
  const id = { email, token }
  // Vérifié avant d'être gardé : un token faux n'est jamais enregistré.
  await clientHttp(site, email, token).champSprint()
  await garderIdentifiants(site, id)
  console.log('Connexion réussie, identifiants gardés.')
  return id
}

function question(texte: string, masque = false): Promise<string> {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (masque) {
      // La saisie n'est pas renvoyée à l'écran (seule la question s'affiche).
      const sortie = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WritableStream }
      sortie._writeToOutput = (s: string) => {
        if (s.includes(texte)) sortie.output.write(s)
      }
    }
    rl.question(texte, (r) => {
      rl.close()
      if (masque) process.stdout.write('\n')
      ok(r)
    })
  })
}

function deux(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date et heure locales, « AAAA-MM-JJTHH:mm ». */
function maintenant(): string {
  const d = new Date()
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`
}

function horodatage(): string {
  const d = new Date()
  return `${deux(d.getHours())}:${deux(d.getMinutes())}`
}

function resume(b: Bilan): string {
  const parties = [`${b.lus} ticket${b.lus > 1 ? 's' : ''} lu${b.lus > 1 ? 's' : ''}`]
  if (b.nouveaux) parties.push(`${b.nouveaux} nouveau${b.nouveaux > 1 ? 'x' : ''}`)
  if (b.modifies) parties.push(`${b.modifies} modifié${b.modifies > 1 ? 's' : ''}`)
  if (b.sortis) parties.push(`${b.sortis} sorti${b.sortis > 1 ? 's' : ''} de la sélection`)
  if (!b.nouveaux && !b.modifies && !b.sortis) parties.push('rien de changé')
  return `${parties.join(', ')}${b.complete ? ' (synchro complète)' : ''}`
}

principal(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error((e as Error).message)
    process.exit(1)
  },
)
