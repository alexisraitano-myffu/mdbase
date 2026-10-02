import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { modeleCompatibleOpenAI } from '../src/adapters/ia/compatible-openai'
import { AdaptateurMemoire } from '../src/core/adaptateur-memoire'
import { DepotEspace } from '../src/core/depot-espace'
import { proposer, type Echange, type Proposition } from '../src/core/ia/assistant'
import { appliquerPlan, ErreurProposition, resumerPlan } from '../src/core/ia/plan'
import type { MessageIA, ModeleIA } from '../src/core/ia/modele'
import { CAS, type Cas } from './cas'
import { CAS_GRAND } from './cas-grand'
import { AUJOURDHUI, espaceAvecGrand, espaceGrand, projetsAvecActions } from './espace-grand'

// Banc de l'assistant IA contre un vrai modèle (réseau, payant) : hors de
// `npm test`. Justesse et vitesse, cas par cas, sur la démo.
//
//   BANC_CLE=… npm run banc                              (Haiku 4.5 par défaut)
//   BANC_ADRESSE=https://…/v1 BANC_MODELE=… BANC_CLE=… npm run banc
//   BANC_CAS=3,12 …                                      (seulement ces cas, numérotés à partir de 1)
//   BANC_JEU=demo | grand                                (un seul jeu ; par défaut les deux, demo puis grand)
//   BANC_INTERVALLE_MS=31000                             (attente entre deux appels : accès anonyme limité à 2/min)
//   BANC_WORKSPACE=wrkspc_…                              (Anthropic : clé non rattachée à un workspace)
//
// Le jeu « grand » ajoute à la démo 240 tickets Jira (lecture seule) et 120
// actions : recherches longues, comptes, descriptions, lots, plusieurs étapes.

const DEMO = fileURLToPath(new URL('../exemples/espace-demo/', import.meta.url))
const adresse = process.env.BANC_ADRESSE ?? 'https://api.anthropic.com/v1'
const modeleNom = process.env.BANC_MODELE ?? 'claude-haiku-4-5'
const cle = process.env.BANC_CLE ?? ''
const choisis = process.env.BANC_CAS?.split(',').map(Number)
const jeu = process.env.BANC_JEU
const intervalle = Number(process.env.BANC_INTERVALLE_MS ?? 0)
const JEUX: { nom: string; cas: Cas[] }[] = [
  { nom: 'demo', cas: CAS },
  { nom: 'grand', cas: CAS_GRAND },
].filter((j) => !jeu || j.nom === jeu)

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

function lireGrand(): Record<string, string> {
  const demo = lireDemo()
  return {
    ...demo,
    '_espace.yaml': espaceAvecGrand(demo['_espace.yaml']!),
    'projets/_schema.yaml': projetsAvecActions(demo['projets/_schema.yaml']!),
    ...espaceGrand().fichiers,
  }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Respecte l'intervalle entre appels, et réessaie après un refus pour trop de requêtes (429). */
function patient(modele: ModeleIA): ModeleIA {
  let dernier = 0
  return async (r) => {
    for (let essai = 0; ; essai++) {
      const reste = dernier + intervalle - Date.now()
      if (reste > 0) await attendre(reste)
      dernier = Date.now()
      try {
        return await modele(r)
      } catch (e) {
        if (essai < 10 && /429|rate|too many|trop de requêtes/i.test(e instanceof Error ? e.message : String(e))) {
          await attendre(Math.max(intervalle, 60_000))
          continue
        }
        throw e
      }
    }
  }
}

/** Compte les appels au modèle et la taille envoyée (le prompt système domine), et garde la trace de chaque tour. */
function compter(modele: ModeleIA) {
  const stats = { appels: 0, caracteres: 0 }
  const trace: { appels: { nom: string; arguments: string }[]; texte: string; coupee?: boolean }[] = []
  const m: ModeleIA = async (r) => {
    stats.appels++
    stats.caracteres += r.messages.reduce((n, x: MessageIA) => n + x.contenu.length, 0)
    const reponse = await modele(r)
    trace.push({ appels: reponse.appels.map((a) => ({ nom: a.nom, arguments: a.arguments.slice(0, 2000) })), texte: reponse.texte.slice(0, 2000), ...(reponse.coupee && { coupee: true }) })
    return reponse
  }
  return { m, stats, trace }
}

it(`banc ${modeleNom}`, async () => {
  expect(cle || adresse.includes('localhost') || process.env.BANC_ANONYME === '1', 'BANC_CLE manquante (ou BANC_ANONYME=1)').toBeTruthy()
  const workspace = process.env.BANC_WORKSPACE
  const envoyer: typeof fetch = (url, init) =>
    fetch(url, workspace ? { ...init, headers: { ...(init?.headers as Record<string, string>), 'anthropic-workspace-id': workspace } } : init)
  const modele = patient(modeleCompatibleOpenAI({ adresse, cle, modele: modeleNom }, envoyer))
  const resultats = []
  let n = 0
  for (const { nom: nomJeu, cas: liste } of JEUX) {
    const fichiers = nomJeu === 'grand' ? lireGrand() : lireDemo()
    for (const cas of liste) {
      n++
      if (choisis && !choisis.includes(n)) continue
      const espace = await DepotEspace.ouvrir(new AdaptateurMemoire(fichiers), {
        aleatoire: (k) => Uint8Array.from({ length: k }, () => Math.floor(Math.random() * 256)),
        planifier: () => () => {},
        aujourdhui: () => AUJOURDHUI,
      })
      const { m, stats, trace } = compter(modele)
      const debut = performance.now()
      let proposition: Proposition | null = null
      let ecart: string | null
      try {
        // Demandes précédentes de la conversation : jouées, appliquées, rejouées comme dans l'app.
        const historique: Echange[] = [...(cas.historique ?? [])]
        for (const avant of cas.avant ?? []) {
          const q = await proposer(m, espace, avant, { aujourdhui: AUJOURDHUI, baseOuverte: cas.base ?? null, historique })
          if (q.type === 'plan') await appliquerPlan(espace, q.plan)
          const reponse = q.type === 'plan' ? `${q.message ? `${q.message}\n` : ''}Proposé :\n${resumerPlan(q.plan)}\nAppliqué.` : q.texte
          historique.push({ demande: avant, reponse, ...(q.deroule ? { deroule: q.deroule, suite: 'Appliqué.' } : {}) })
        }
        proposition = await proposer(m, espace, cas.demande, { aujourdhui: AUJOURDHUI, baseOuverte: cas.base ?? null, historique })
        ecart = cas.verifier(proposition)
      } catch (e) {
        // Une proposition refusée par le cœur n'écrit rien : c'est juste pour les cas « ne rien écrire ».
        // Une erreur du service (clé, réseau) ne mesure rien : toujours un échec.
        const refusee = e instanceof ErreurProposition && cas.verifier({ type: 'reponse', texte: '', memoire: [] }) === null
        ecart = refusee ? null : `erreur : ${e instanceof Error ? e.message : String(e)}`
      }
      const ms = Math.round(performance.now() - debut)
      resultats.push({ n, jeu: nomJeu, demande: cas.demande, ok: ecart === null, ecart, ms, ...stats, proposition, trace })
      console.log(`${ecart === null ? '✓' : '✗'} ${String(n).padStart(2)} ${String(ms).padStart(6)} ms  ${stats.appels} appel${stats.appels > 1 ? 's' : ''}  [${nomJeu}] ${cas.avant ? `${cas.avant.join(' → ')} → ` : ''}${cas.demande}${ecart ? `\n        → ${ecart}` : ''}`)
    }
  }
  const reussis = resultats.filter((r) => r.ok).length
  const durees = resultats.map((r) => r.ms).sort((a, b) => a - b)
  const mediane = durees[Math.floor(durees.length / 2)] ?? 0
  for (const { nom: nomJeu } of JEUX) {
    const duJeu = resultats.filter((r) => r.jeu === nomJeu)
    if (duJeu.length) console.log(`  ${nomJeu} : ${duJeu.filter((r) => r.ok).length}/${duJeu.length}`)
  }
  console.log(`\n${modeleNom} : ${reussis}/${resultats.length} justes, médiane ${mediane} ms, max ${durees.at(-1)} ms, ${Math.round(resultats[0]?.caracteres ?? 0)} caractères au 1er appel`)
  mkdirSync(fileURLToPath(new URL('./resultats/', import.meta.url)), { recursive: true })
  const fichier = new URL(`./resultats/${modeleNom.replace(/[^\w.-]/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`, import.meta.url)
  writeFileSync(fichier, JSON.stringify({ modele: modeleNom, adresse, reussis, total: resultats.length, mediane, resultats }, null, 1))
}, 4 * 60 * 60_000)
