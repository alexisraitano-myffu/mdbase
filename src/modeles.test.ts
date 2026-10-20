// Modèles livrés (spec §19 « Modèles ») : chacun s'installe sans avertissement
// à côté d'un espace existant, n'écrit que des fichiers neufs, et ses
// références suivent quand un identifiant est déjà pris.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DepotEspace } from './core/depot-espace'
import { FICHIERS_RELATIONS } from './core/fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './core/fixtures/outils'
import { reglagesChargeParDefaut } from './core/charge'
import { lire } from './core/ia/lecture'
import { lireModele, remplacerDates, suivreReferences } from './core/modeles'

const RACINE = 'modeles'

function lireDossier(dossier: string, racine: string, fichiers: Record<string, string> = {}) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) lireDossier(chemin, racine, fichiers)
    else fichiers[relative(racine, chemin)] = readFileSync(chemin, 'utf8')
  }
  return fichiers
}

const MODELES = readdirSync(RACINE).map((id) => lireModele(id, lireDossier(join(RACINE, id), join(RACINE, id))))

async function ouvrir(fichiers: Record<string, string> = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur(fichiers)
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-10-21' })
  return { a, espace }
}

describe('modèles : outils', () => {
  it('{{jour:N}} part du lundi de la semaine', () => {
    expect(remplacerDates('debut: {{jour:0}}\nfin: {{jour:-3}}\n', '2026-10-21')).toBe('debut: 2026-10-19\nfin: 2026-10-16\n')
    expect(remplacerDates('{{jour:0}}', '2026-10-25')).toBe('2026-10-19') // un dimanche
  })

  it('les clés base et cible suivent, à toute profondeur ; le reste ne bouge pas', () => {
    const ids = new Map([['projets', 'projets-2']])
    expect(suivreReferences('id: x\ncible: projets\n', ids)).toBe('id: x\ncible: projets-2\n')
    expect(suivreReferences('deplier:\n  - { base: projets, relation: projets }\n', ids)).toBe('deplier:\n  - { base: projets-2, relation: projets }\n')
    const tel = 'nom: projets # commentaire\n'
    expect(suivreReferences(tel, ids)).toBe(tel)
  })
})

describe.each(MODELES.map((m) => [m.id, m] as const))('modèle %s', (_, m) => {
  it('a un nom, une description et des bases', () => {
    expect(m.nom).not.toBe('')
    expect(m.description).not.toBe('')
    expect(m.bases.length).toBeGreaterThan(0)
  })

  it('s’installe dans un espace vide sans avertissement, dans un groupe à son nom', async () => {
    const { espace } = await ouvrir({})
    const r = await espace.utiliserModele(m)
    const etat = espace.etat()
    expect(etat.groupes).toEqual([{ nom: m.nom, bases: m.bases }])
    expect(r.bases).toEqual(m.bases)
    for (const b of etat.bases.values()) expect(b.chargement.ok && b.chargement.base).toMatchObject({ avertissements: [], nonReconnus: [] })
    for (const d of etat.dashboards) expect(d.avertissements).toEqual([])
  })

  it('à côté de l’existant : identifiants dédoublonnés, références suivies, aucun fichier existant réécrit', async () => {
    const { a, espace } = await ouvrir()
    const avant = new Set(Object.keys(FICHIERS_RELATIONS))
    const r = await espace.utiliserModele(m)
    expect(a.ecritures.filter((c) => avant.has(c) && c !== '_espace.yaml')).toEqual([])
    const etat = espace.etat()
    for (const id of r.bases) {
      const schema = etat.bases.get(id)!.depot!.schema
      expect(schema.id).toBe(id)
      for (const c of schema.colonnes) if (c.type === 'relation') expect(r.bases).toContain(c.cible)
    }
    for (const b of etat.bases.values()) expect(b.chargement.ok && b.chargement.base).toMatchObject({ avertissements: [], nonReconnus: [] })
    // Une deuxième installation prend d'autres identifiants et un autre groupe.
    const r2 = await espace.utiliserModele(m)
    expect(r2.groupe).toBe(`${m.nom} 2`)
    expect(r2.bases.some((b) => r.bases.includes(b))).toBe(false)
  })
})

describe('modèle planification-charge', () => {
  it('ses exemples se calculent, dates ramenées autour d’aujourd’hui', async () => {
    const { espace } = await ouvrir()
    const r = await espace.utiliserModele(MODELES.find((m) => m.id === 'planification-charge')!)
    expect(r.bases).toEqual(['ressources', 'projets-2', 'versions', 'besoins', 'affectations', 'absences', 'moratoires'])
    const etat = espace.etat()
    const v = (base: string, id: string, cle: string) => {
      const c = etat.calculs.get(base)?.get(id)?.[cle]
      return c?.etat === 'ok' ? c.valeur : c
    }
    expect(v('projets-2', 'pport001', 'jours_demandes')).toBe(75)
    const portail = etat.bases.get('projets-2')!.depot!.lignes().find((l) => l.id === 'pport001')!
    expect(portail.cellules.debut).toEqual({ etat: 'ok', valeur: '2026-10-05' })
    expect(etat.bases.get('projets-2')!.vues.map((v) => v.type)).toEqual(['tableau', 'timeline'])
    // La vue Plan de charge du modèle : ses réglages sont ceux qu'une nouvelle vue retrouverait seule.
    const charge = etat.bases.get('ressources')!.vues[0]!
    expect(charge.type).toBe('charge')
    const { capacite, groupe, affectations, absences, besoins, moratoires } = charge
    expect(affectations).toMatchObject({ detail: 'detail', scenario: 'scenario' })
    expect(besoins).toMatchObject({ apres: 'a_partir_de' })
    expect(reglagesChargeParDefaut(etat.bases, 'ressources')).toEqual({ capacite, groupe, affectations, absences, besoins, moratoires })
    expect(affectations?.projet).toBe('projet')
    // L'outil commun à l'assistant et au MCP lit les mêmes chiffres.
    const texte = lire(etat, { id: 'c1', nom: 'calculer_charge', arguments: '{"semaines": 2}' }, { aujourdhui: '2026-10-21' })
    expect(texte).toContain('2 semaines à partir du 2026-10-19')
    expect(texte).toContain('Camille (Développement) | 19/10 5/5 ; 26/10 5/5')
    expect(texte).toMatch(/Application mobile \| Développement avant 2027-01-04 \| 0\/80 : il manque 80 j/)
    // Le détail de Camille (0,5 j le jeudi 12 novembre, semaine du 11 novembre férié) ; le scénario d'essai, compté seulement quand on le demande.
    expect(lire(etat, { id: 'c2', nom: 'calculer_charge', arguments: '{"debut": "2026-11-09", "semaines": 1}' }, { aujourdhui: '2026-10-21' })).toContain('Camille (Développement) | 09/11 3,5/4')
    const avecEssai = lire(etat, { id: 'c3', nom: 'calculer_charge', arguments: '{"debut": "2026-11-30", "semaines": 1, "scenario": "Option A"}' }, { aujourdhui: '2026-10-21' })
    expect(avecEssai).toContain('plan réel + scénario « Option A »')
    expect(avecEssai).toMatch(/Sami \(Test\) \| 30\/11 3\/5/)
    const remplissage = lire(
      etat,
      { id: 'c4', nom: 'proposer_remplissage', arguments: '{"projet": "Intranet RH", "role": "Développement", "jours": 10, "debut": "2026-12-07", "fin": "2026-12-31", "scenario": "Option B"}' },
      { aujourdhui: '2026-10-21' },
    )
    expect(remplissage).toContain('10 j placés')
    expect(remplissage).toContain('"scenario":"Option B"')
    expect(remplissage).toContain('ajoute d\'abord l\'option avec ajouter_options')
    // Moratoires : la fermeture de fin d'année retire des jours ; une fin dans le gel recule avant lui.
    const decembre = lire(etat, { id: 'c5', nom: 'calculer_charge', arguments: '{"debut": "2026-12-21", "semaines": 1}' }, { aujourdhui: '2026-10-21' })
    expect(decembre).toContain('Moratoire Fermeture de fin d\'année du 2026-12-24 au 2026-12-28 : fermé')
    expect(decembre).toContain('Nora (Pilotage) | 21/12 1/3') // 24 fermé, 25 férié : trois jours ouvrés
    const gel = lire(
      etat,
      { id: 'c6', nom: 'proposer_remplissage', arguments: '{"projet": "Intranet RH", "lignes": [{"role": "Test", "jours": 5, "debut": "2026-12-01", "fin": "2026-12-20"}]}' },
      { aujourdhui: '2026-10-21' },
    )
    expect(gel).toContain('au 2026-12-13 (fin ramenée avant le gel Gel des mises en production)')
    const parBesoins = lire(etat, { id: 'c7', nom: 'proposer_remplissage', arguments: '{"projet": "Portail client", "depuis_besoins": true}' }, { aujourdhui: '2026-10-21' })
    expect(parBesoins).toMatch(/Test, [\d,]+ j du 2026-11-23 au 2026-11-30/)
  })
})
