import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'
import { expect, it } from 'vitest'
import { DepotEspace } from '../src/core/depot-espace'
import { AdaptateurNode } from '../src/outils/commun/fichiers-node'

// Banc de volume (collaboration, voie 1) : jusqu'où un espace de fichiers
// Markdown tient-il ? Génère des espaces de N lignes sur le modèle de la démo
// (clients, projets, tâches : relations, rollups, formules, dashboards), sur le
// disque, puis mesure l'ouverture, la relecture (rien n'a changé, puis 20
// fichiers changés « par un collègue ») et une écriture depuis l'app.
//
//   npm run banc -- volume
//   BANC_TAILLES=5000,20000 BANC_DOSSIER=<dossier OneDrive> BANC_GARDER=1 npm run banc -- volume
//
// BANC_DOSSIER : où écrire les espaces (par défaut, le dossier temporaire) ;
// BANC_GARDER=1 les garde, pour les ouvrir dans l'app ou les synchroniser ;
// BANC_PROFIL=<fichier.cpuprofile> enregistre le profil CPU de 5 modifications d'une case.

const DEMO = fileURLToPath(new URL('../exemples/espace-demo/', import.meta.url))
const TAILLES = (process.env.BANC_TAILLES ?? '5000,20000,50000').split(',').map(Number)
const AUJOURDHUI = '2026-10-20'

const options = {
  aleatoire: (n: number) => webcrypto.getRandomValues(new Uint8Array(n)),
  planifier: (action: () => void, ms: number) => {
    const t = setTimeout(action, ms)
    return () => clearTimeout(t)
  },
  aujourdhui: () => AUJOURDHUI,
}

const jour = (decalage: number) => {
  const d = new Date(`${AUJOURDHUI}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + decalage)
  return d.toISOString().slice(0, 10)
}

/** Un espace de `n` lignes : 1 client pour 25 projets, 1 projet pour 20 tâches. */
function generer(racine: string, n: number): void {
  for (const base of ['clients', 'projets', 'taches']) {
    mkdirSync(join(racine, base), { recursive: true })
    cpSync(join(DEMO, base, '_schema.yaml'), join(racine, base, '_schema.yaml'))
    cpSync(join(DEMO, base, '_vues'), join(racine, base, '_vues'), { recursive: true })
  }
  cpSync(join(DEMO, '_espace.yaml'), join(racine, '_espace.yaml'))
  cpSync(join(DEMO, '_dashboards'), join(racine, '_dashboards'), { recursive: true })
  const nbProjets = Math.max(1, Math.round(n / 21))
  const nbClients = Math.max(1, Math.round(nbProjets / 25))
  const nbTaches = n - nbProjets - nbClients
  const ecrire = (base: string, id: string, champs: string) => writeFileSync(join(racine, base, `ligne-${id}--${id}.md`), `---\nid: ${id}\n${champs}---\n`)
  const secteurs = ['Industrie', 'Commerce', 'Services']
  const statuts = ['À faire', 'En cours', 'Terminé']
  const priorites = ['Haute', 'Normale', 'Basse']
  for (let i = 0; i < nbClients; i++) ecrire('clients', `c${i}`, `nom: Client ${i}\nsecteur: ${secteurs[i % 3]}\n`)
  for (let i = 0; i < nbProjets; i++)
    ecrire('projets', `p${i}`, `titre: Projet ${i}\nstatut: ${statuts[i % 3]}\nclient: c${i % nbClients}\ndebut: ${jour(-(i % 90))}\necheance: ${jour(i % 120)}\nbudget: ${1000 + (i % 50) * 100}\n`)
  for (let i = 0; i < nbTaches; i++)
    ecrire(
      'taches',
      `t${i}`,
      `titre: Tâche ${i}\nprojet: p${i % nbProjets}\npriorite: ${priorites[i % 3]}\ndebut: ${jour(-(i % 60))}\necheance: ${jour(i % 45)}\nheures: ${1 + (i % 8)}\n${i % 4 === 0 ? 'fait: true\n' : ''}`,
    )
}

async function chrono<T>(f: () => Promise<T>): Promise<[number, T]> {
  const debut = performance.now()
  const r = await f()
  return [Math.round(performance.now() - debut), r]
}

/** Tas JavaScript en Mo ; mesure fiable seulement avec --expose-gc (vitest.banc.config.ts). */
const mo = () => Math.round(process.memoryUsage().heapUsed / 1e6)

it('volume : ouverture, relecture et écriture selon le nombre de lignes', async () => {
  const lignes: string[] = []
  for (const n of TAILLES) {
    const racine = mkdtempSync(join(process.env.BANC_DOSSIER ?? tmpdir(), `mdbase-volume-${n}-`))
    const [tGen] = await chrono(async () => generer(racine, n))
    globalThis.gc?.()
    const avant = mo()
    const [tOuvrir, espace] = await chrono(() => DepotEspace.ouvrir(new AdaptateurNode(racine), options))
    globalThis.gc?.()
    const memoire = mo() - avant // l'espace ouvert, ce qui reste après un ramasse-miettes forcé
    const taches = espace.etat().bases.get('taches')!.depot!
    expect(taches.lignes().length).toBeGreaterThan(n * 0.9)
    const [tOuvrir2] = await chrono(() => DepotEspace.ouvrir(new AdaptateurNode(racine), options))

    const [tRelireRien] = await chrono(() => espace.rafraichir())
    // Un collègue modifie 20 tâches (synchro) : la relecture doit les retrouver.
    for (let i = 0; i < 20; i++) {
      const f = join(racine, 'taches', `ligne-t${i}--t${i}.md`)
      writeFileSync(f, readFileSync(f, 'utf8').replace(/heures: \d+/, 'heures: 42'))
    }
    const [tRelire20, change] = await chrono(() => espace.rafraichir())
    expect(change).toBe(true)

    const chemin = taches.lignes().find((l) => l.id === 't100')!.chemin
    if (process.env.BANC_PROFIL) {
      const { Session } = await import('node:inspector/promises')
      const session = new Session()
      session.connect()
      await session.post('Profiler.enable')
      await session.post('Profiler.start')
      for (let k = 0; k < 5; k++) {
        await espace.modifierLignes('taches', [chemin], 'heures', k)
        await espace.vider()
      }
      const { profile } = await session.post('Profiler.stop')
      writeFileSync(process.env.BANC_PROFIL, JSON.stringify(profile))
    }
    const [tModifier] = await chrono(async () => {
      await espace.modifierLignes('taches', [chemin], 'heures', 7)
      await espace.vider()
    })
    const [tCreer] = await chrono(async () => {
      await espace.creerLigne('taches', { titre: 'Nouvelle', projet: ['p1'] })
      await espace.vider()
    })

    lignes.push(`| ${n} | ${tGen} | ${tOuvrir} | ${tOuvrir2} | ${memoire} | ${tRelireRien} | ${tRelire20} | ${tModifier} | ${tCreer} |`)
    console.log(lignes.at(-1))
    if (process.env.BANC_GARDER) console.log(`gardé : ${racine}`)
    else rmSync(racine, { recursive: true, force: true })
  }
  const tableau = [
    `Banc de volume, ${new Date().toISOString().slice(0, 16)}, ${process.platform}, dossier ${process.env.BANC_DOSSIER ?? 'temporaire'}`,
    '',
    '| lignes | génération (ms) | ouverture (ms) | 2e ouverture (ms) | mémoire (Mo) | relecture sans changement (ms) | relecture, 20 changées (ms) | modifier 1 case (ms) | créer 1 ligne (ms) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...lignes,
  ].join('\n')
  console.log(`\n${tableau}\n`)
  mkdirSync(fileURLToPath(new URL('./resultats/', import.meta.url)), { recursive: true })
  writeFileSync(fileURLToPath(new URL(`./resultats/volume-${new Date().toISOString().slice(0, 10)}-${process.platform}.md`, import.meta.url)), `${tableau}\n`)
}, 1_800_000)
