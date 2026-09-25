import type { Echange, Proposition } from '../src/core/ia/assistant'
import type { Valeur } from '../src/core/valeurs'

// Cas du banc de l'assistant IA, sur la démo (`exemples/espace-demo/`) au
// 2026-09-25 (vendredi). Chaque cas repart d'une copie neuve de la démo.
// `verifier` renvoie `null` si la proposition est la bonne, sinon ce qui cloche.

export type Cas = {
  demande: string
  historique?: Echange[]
  /** Base ouverte dans l'app au moment de la demande. */
  base?: string
  verifier: (p: Proposition) => string | null
}

type Attendu = Record<string, Record<string, Valeur | undefined>>

const egal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Modification exacte : ces lignes (par id) et seulement elles, avec au moins ces valeurs. */
function modifie(base: string, attendu: Attendu) {
  return (p: Proposition): string | null => {
    if (p.type !== 'plan') return `plan attendu, reçu : ${p.type === 'reponse' ? p.texte.slice(0, 120) : ''}`
    const ops = p.plan.operations.filter((o) => o.type === 'modifier' && o.base === base)
    if (ops.length !== p.plan.operations.length) return `opérations en trop : ${p.plan.operations.map((o) => `${o.type} ${o.base}`).join(', ')}`
    const lignes = ops.flatMap((o) => o.lignes)
    const ids = lignes.map((l) => l.id).sort()
    const voulus = Object.keys(attendu).sort()
    if (!egal(ids, voulus)) return `lignes ${ids.join(', ')} au lieu de ${voulus.join(', ')}`
    for (const l of lignes) {
      for (const [cle, v] of Object.entries(attendu[l.id!]!)) {
        if (!egal(l.valeurs[cle], v)) return `${l.id}.${cle} = ${JSON.stringify(l.valeurs[cle])} au lieu de ${JSON.stringify(v)}`
      }
    }
    return null
  }
}

/** Création : ce nombre de lignes dans la base, chacune avec au moins ces valeurs (titre : contient, sans casse). */
function cree(base: string, attendues: Record<string, Valeur | undefined>[]) {
  return (p: Proposition): string | null => {
    if (p.type !== 'plan') return `plan attendu, reçu : ${p.type === 'reponse' ? p.texte.slice(0, 120) : ''}`
    const lignes = p.plan.operations.filter((o) => o.type === 'creer' && o.base === base).flatMap((o) => o.lignes)
    if (lignes.length !== attendues.length || p.plan.operations.some((o) => o.base !== base || o.type !== 'creer')) {
      return `créations : ${p.plan.operations.map((o) => `${o.type} ${o.lignes.length} ${o.base}`).join(', ')}`
    }
    for (const [i, a] of attendues.entries()) {
      const l = lignes[i]!
      for (const [cle, v] of Object.entries(a)) {
        const recu = l.valeurs[cle]
        const ok = cle === 'titre' && typeof v === 'string' ? typeof recu === 'string' && recu.toLowerCase().includes(v.toLowerCase()) : egal(recu, v)
        if (!ok) return `ligne ${i + 1}, ${cle} = ${JSON.stringify(recu)} au lieu de ${JSON.stringify(v)}`
      }
    }
    return null
  }
}

/** Aucune écriture : une question, une explication ou un refus. */
const rienEcrit = (p: Proposition): string | null => (p.type === 'plan' ? `ne devait rien proposer : ${p.plan.operations.map((o) => `${o.type} ${o.lignes.length} ${o.base}`).join(', ')}` : null)

export const CAS: Cas[] = [
  // ── Modifications simples ──
  { demande: 'Coche la tâche Cadrage', verifier: modifie('taches', { tcadr004: { fait: true } }) },
  { demande: 'Passe le site vitrine en terminé', verifier: modifie('projets', { psite001: { statut: 'Terminé' } }) },
  { demande: 'Mets 7 heures sur l’intégration', verifier: modifie('taches', { tinte002: { heures: 7 } }) },
  { demande: 'Décale l’échéance de la recette au 2 octobre', verifier: modifie('taches', { trece007: { echeance: '2026-10-02' } }) },
  { demande: 'Le budget de la boutique en ligne passe à 15 000', verifier: modifie('projets', { pbout003: { budget: 15000 } }) },
  { demande: 'Globex est maintenant dans les services', verifier: modifie('clients', { cglob002: { secteur: 'Services' } }) },
  { demande: 'Renomme la tâche Cadrage en Cadrage fonctionnel', verifier: modifie('taches', { tcadr004: { titre: 'Cadrage fonctionnel' } }) },
  { demande: 'Retire la date de revue de l’application mobile', verifier: modifie('projets', { pmobi002: { revue: undefined } }) },
  { demande: 'L’échéance de la mise en ligne passe à vendredi prochain', verifier: modifie('taches', { tmise003: { echeance: '2026-10-02' } }) },
  // ── Relations ──
  { demande: 'Rattache la tâche Recette au projet Site vitrine', verifier: modifie('taches', { trece007: { projet: ['psite001'] } }) },
  { demande: 'Le projet Application mobile est pour Globex', verifier: modifie('projets', { pmobi002: { client: ['cglob002'] } }) },
  // ── Plusieurs lignes, par critère ──
  { demande: 'Les tâches en retard passent en priorité basse', verifier: modifie('taches', { tcata005: { priorite: 'Basse' } }) },
  {
    demande: 'Toutes les tâches de la boutique en ligne sont faites',
    verifier: modifie('taches', { tcata005: { fait: true }, tpaie006: { fait: true }, trece007: { fait: true } }),
  },
  { demande: 'Marque comme faites les tâches de priorité normale du site vitrine', verifier: modifie('taches', { tinte002: { fait: true }, tmise003: { fait: true } }) },
  { demande: 'Passe tous les projets d’Acme en cours', verifier: modifie('projets', { pmobi002: { statut: 'En cours' } }) },
  { demande: 'Toutes les tâches de priorité basse passent en normale', verifier: modifie('taches', { trece007: { priorite: 'Normale' } }) },
  // ── Créations ──
  {
    demande: 'Crée une tâche Relancer Acme pour le site vitrine, 2 heures, priorité haute',
    verifier: cree('taches', [{ titre: 'Relancer Acme', projet: ['psite001'], heures: 2, priorite: 'Haute' }]),
  },
  {
    demande: 'Ajoute trois tâches au projet Application mobile : Maquettes mobiles, Développement, Tests',
    verifier: cree('taches', [
      { titre: 'Maquettes mobiles', projet: ['pmobi002'] },
      { titre: 'Développement', projet: ['pmobi002'] },
      { titre: 'Tests', projet: ['pmobi002'] },
    ]),
  },
  { demande: 'Ajoute un client Umbrella dans le commerce', verifier: cree('clients', [{ nom: 'Umbrella', secteur: 'Commerce' }]) },
  // ── Conversation ──
  {
    demande: 'La boutique, terminée',
    historique: [{ demande: 'Change le statut du projet', reponse: 'Quel projet, et quel statut ?' }],
    verifier: modifie('projets', { pbout003: { statut: 'Terminé' } }),
  },
  // ── Ne rien écrire ──
  { demande: 'Mets la tâche Paiement en priorité critique', verifier: rienEcrit },
  { demande: 'Supprime la tâche Rapport', verifier: rienEcrit },
  { demande: 'Modifie la tâche', verifier: rienEcrit },
  { demande: 'Change la priorité de la tâche Cadrage', verifier: rienEcrit },
  { demande: 'Les heures totales d’Acme passent à 50', verifier: rienEcrit },
  // ── Mémoire et skills ──
  {
    demande: 'Retiens que quand je dis « le gros client », je parle d’Acme',
    verifier: (p) => (p.memoire.some((m) => m.type === 'retenir' && /acme/i.test(m.fait)) && p.type !== 'plan' ? null : 'retenir attendu, sans plan'),
  },
  {
    demande: 'Crée un skill « Clôture » : quand un projet est terminé, cocher toutes ses tâches',
    verifier: (p) =>
      p.type === 'plan' && p.plan.operations.length === 0 && p.plan.skills?.length === 1 && /cl[ôo]ture/i.test(p.plan.skills[0]!.nom) ? null : 'un skill seul attendu',
  },
]
