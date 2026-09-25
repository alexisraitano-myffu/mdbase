import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { modeleCompatibleOpenAI } from '../src/adapters/ia/compatible-openai'
import { AdaptateurMemoire } from '../src/core/adaptateur-memoire'
import { DepotEspace } from '../src/core/depot-espace'
import { proposer, type Proposition } from '../src/core/ia/assistant'
import type { MessageIA, ModeleIA } from '../src/core/ia/modele'
import { CAS } from './cas'

// Banc de l'assistant IA contre un vrai modèle (réseau, payant) : hors de
// `npm test`. Justesse et vitesse, cas par cas, sur la démo.
//
//   BANC_CLE=… npm run banc                              (Haiku 4.5 par défaut)
//   BANC_ADRESSE=https://…/v1 BANC_MODELE=… BANC_CLE=… npm run banc
//   BANC_CAS=3,12 …                                      (seulement ces cas, numérotés à partir de 1)

const AUJOURDHUI = '2026-09-25'
const DEMO = fileURLToPath(new URL('../exemples/espace-demo/', import.meta.url))
const adresse = process.env.BANC_ADRESSE ?? 'https://api.anthropic.com/v1'
const modeleNom = process.env.BANC_MODELE ?? 'claude-haiku-4-5'
const cle = process.env.BANC_CLE ?? ''
const choisis = process.env.BANC_CAS?.split(',').map(Number)

function lireDemo(): Record<string, string> {
  const fichiers: Record<string, string> = {}
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n)
      if (statSync(c).isDirectory()) parcourir(c)
      else fichiers[relative(DEMO, c)] = readFileSync(c, 'utf8')
    }
  }
  parcourir(DEMO)
  return fichiers
}

/** Compte les appels au modèle et la taille envoyée (le prompt système domine). */
function compter(modele: ModeleIA) {
  const stats = { appels: 0, caracteres: 0 }
  const m: ModeleIA = async (r) => {
    stats.appels++
    stats.caracteres += r.messages.reduce((n, x: MessageIA) => n + x.contenu.length, 0)
    return modele(r)
  }
  return { m, stats }
}

it(`banc ${modeleNom}`, async () => {
  expect(cle || adresse.includes('localhost'), 'BANC_CLE manquante').toBeTruthy()
  const modele = modeleCompatibleOpenAI({ adresse, cle, modele: modeleNom })
  const resultats = []
  for (const [i, cas] of CAS.entries()) {
    if (choisis && !choisis.includes(i + 1)) continue
    const espace = await DepotEspace.ouvrir(new AdaptateurMemoire(lireDemo()), {
      aleatoire: (n) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256)),
      planifier: () => () => {},
      aujourdhui: () => AUJOURDHUI,
    })
    const { m, stats } = compter(modele)
    const debut = performance.now()
    let proposition: Proposition | null = null
    let ecart: string | null
    try {
      proposition = await proposer(m, espace, cas.demande, { aujourdhui: AUJOURDHUI, baseOuverte: cas.base ?? null, historique: cas.historique })
      ecart = cas.verifier(proposition)
    } catch (e) {
      // Une proposition refusée deux fois n'écrit rien : c'est juste pour les cas « ne rien écrire ».
      ecart = cas.verifier({ type: 'reponse', texte: '', memoire: [] }) === null ? null : `erreur : ${e instanceof Error ? e.message : String(e)}`
    }
    const ms = Math.round(performance.now() - debut)
    resultats.push({ n: i + 1, demande: cas.demande, ok: ecart === null, ecart, ms, ...stats, proposition })
    console.log(`${ecart === null ? '✓' : '✗'} ${String(i + 1).padStart(2)} ${String(ms).padStart(5)} ms  ${stats.appels} appel${stats.appels > 1 ? 's' : ''}  ${cas.demande}${ecart ? `\n        → ${ecart}` : ''}`)
  }
  const reussis = resultats.filter((r) => r.ok).length
  const durees = resultats.map((r) => r.ms).sort((a, b) => a - b)
  const mediane = durees[Math.floor(durees.length / 2)] ?? 0
  console.log(`\n${modeleNom} : ${reussis}/${resultats.length} justes, médiane ${mediane} ms, max ${durees.at(-1)} ms, ${Math.round(resultats[0]?.caracteres ?? 0)} caractères au 1er appel`)
  mkdirSync(fileURLToPath(new URL('./resultats/', import.meta.url)), { recursive: true })
  const fichier = new URL(`./resultats/${modeleNom.replace(/[^\w.-]/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`, import.meta.url)
  writeFileSync(fichier, JSON.stringify({ modele: modeleNom, adresse, reussis, total: resultats.length, mediane, resultats }, null, 1))
}, 30 * 60_000)
