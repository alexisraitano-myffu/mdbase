import { describe, expect, it } from 'vitest'
import { lireBlocAnalyse, lireCondition, lireParametres, lireRequetes, type Parametre } from './analyse'
import { citer, type EtatRequete } from './calcul'
import { couleurRegle, formater, remplit } from './regles'
import { envelopper, litteral, litteralDate, substituer, valeurParametre } from './sql'

// Analyse des dashboards (spec §10 « Analyse ») : la partie sans moteur.

describe('littéraux et paramètres', () => {
  it('échappe toute valeur collée dans une requête', () => {
    expect(litteral("l'été'); drop table x; --")).toBe("'l''été''); drop table x; --'")
    expect(litteral(3.5)).toBe('3.5')
    expect(litteral(Number.NaN)).toBe('NULL')
    expect(litteral(true)).toBe('TRUE')
    expect(litteral(undefined)).toBe('NULL')
    expect(litteral(['a', "b'c"])).toBe("['a', 'b''c']::VARCHAR[]")
    expect(litteralDate('2026-10-01')).toBe("DATE '2026-10-01'")
    expect(litteralDate('2026-10-01T14:32')).toBe("TIMESTAMP '2026-10-01 14:32:00'")
    expect(litteralDate("2026' or 1=1")).toBe('NULL')
  })

  const parametres: Parametre[] = [
    { nom: 'mois', type: 'mois', defaut: 'courant' },
    { nom: 'avant', type: 'mois', valeur: 'precedent' },
    { nom: 'equipe', type: 'choix', options: ['A'], valeur: "O'Neil" },
    { nom: 'seuil', type: 'nombre', defaut: 5 },
    { nom: 'jour', type: 'date', valeur: '2026-10-03' },
    { nom: 'periode', type: 'periode', valeur: ['2026-09-01', '2026-09-30'] },
    { nom: 'vide', type: 'texte' },
  ]

  it('mois courant ou précédent, résolus au jour donné', () => {
    expect(valeurParametre(parametres[0]!, '2026-01-15')).toBe('2026-01')
    expect(valeurParametre(parametres[1]!, '2026-01-15')).toBe('2025-12')
  })

  it('remplace {{nom}} par le littéral, une période par ses bornes', () => {
    const sql = substituer('m = {{mois}} and e = {{ equipe }} and n > {{seuil}} and d = {{jour}} and d between {{periode.debut}} and {{periode.fin}} and v = {{vide}}', parametres, '2026-10-12')
    expect(sql).toBe("m = '2026-10' and e = 'O''Neil' and n > 5 and d = DATE '2026-10-03' and d between DATE '2026-09-01' and DATE '2026-09-30' and v = NULL")
  })

  it('refuse un paramètre inconnu ou mal cité', () => {
    expect(() => substituer('{{inconnu}}', parametres, '2026-10-12')).toThrow('paramètre « inconnu » inconnu')
    expect(() => substituer('{{periode}}', parametres, '2026-10-12')).toThrow('période')
    expect(() => substituer('{{mois.debut}}', parametres, '2026-10-12')).toThrow("n'est pas une période")
  })

  it('enveloppe la requête : une seule lecture, coupée', () => {
    expect(envelopper('select 1;\n', 10)).toBe('select * from (\nselect 1\n) as resultat limit 11')
    expect(() => envelopper('  ')).toThrow('requête vide')
  })
})

describe('lecture du fichier', () => {
  it('bloc d’analyse : réglages gardés, erreurs signalées', () => {
    const av: string[] = []
    const b = lireBlocAnalyse({ type: 'barres', donnees: 'n', x: 'statut', y: 'n', empile: true, format: 'entier', regles: [{ si: '> 5', couleur: 'rouge' }, { si: 'grand', couleur: 'vert' }], largeur: 50 }, 'bloc', av)
    expect(b).toEqual({ type: 'barres', donnees: 'n', x: 'statut', y: ['n'], empile: true, format: 'entier', regles: [{ si: '> 5', couleur: 'rouge' }] })
    expect(av).toEqual(['bloc : règle ignorée (« si » comme \'> 50\' et « couleur » attendus)'])
    expect(lireBlocAnalyse({ type: 'camembert' }, 'bloc', av)).toBeNull()
    expect(lireBlocAnalyse({ type: 'tableau', sql: 'select 1', format: { a: 'euros', b: 'inconnu' } }, 'bloc', [])?.format).toEqual({ a: 'euros' })
  })

  it('requêtes et paramètres : noms valides seulement', () => {
    const av: string[] = []
    expect(lireRequetes({ total: 'select 1', 'Mauvais nom': 'select 2', vide: ' ' }, 'd', av)).toEqual({ total: 'select 1' })
    expect(av).toHaveLength(2)
    expect(lireParametres([{ nom: 'mois', type: 'mois', defaut: 'courant' }, { nom: 'mois', type: 'texte' }, { nom: 'x', type: 'liste' }], 'd', av)).toEqual([{ nom: 'mois', type: 'mois', defaut: 'courant' }])
  })
})

describe('règles et formats', () => {
  const ligne = { n: 7, objectif: 10, statut: 'Bloqué', d: '2026-10-01' }

  it('compare à un nombre, un texte, une date ou une autre colonne', () => {
    expect(lireCondition("= 'En cours'")).toEqual({ comparaison: '=', operande: 'En cours' })
    expect(lireCondition('> ')).toBeNull()
    expect(remplit('> 5', 7, ligne)).toBe(true)
    expect(remplit('>= 7', 7, ligne)).toBe(true)
    expect(remplit('< objectif', 7, ligne)).toBe(true)
    expect(remplit('= Bloqué', 'Bloqué', ligne)).toBe(true)
    expect(remplit('!= Bloqué', 'Bloqué', ligne)).toBe(false)
    expect(remplit('< 2026-10-12', '2026-10-01', ligne)).toBe(true)
    expect(remplit('> 5', null, ligne)).toBe(false)
  })

  it('la première règle qui s’applique gagne', () => {
    const regles = [{ si: '> 100', couleur: 'rouge' }, { si: '> 5', couleur: 'orange' }, { colonne: 'statut', si: '= Bloqué', couleur: 'violet', ligne: true }]
    expect(couleurRegle(regles, ligne, (r) => (r.ligne ? undefined : (r.colonne ?? 'n')))).toBe('orange')
    expect(couleurRegle(regles, ligne, (r) => (r.ligne ? r.colonne : undefined))).toBe('violet')
    expect(couleurRegle([{ si: '> 1', couleur: 'fluo' }], ligne, () => 'n')).toBeUndefined()
  })

  it('formats français', () => {
    expect(formater(1234.5)).toBe('1 234,5')
    expect(formater(1234.5, 'entier')).toBe('1 235')
    expect(formater(0.256, 'pourcent')).toBe('25,6 %')
    expect(formater(12, 'euros')).toBe('12,00 €')
    expect(formater('2026-10-01')).toBe('01/10/2026')
    expect(formater('2026-10-01T14:32')).toBe('01/10/2026 14:32')
    expect(formater(null)).toBe('')
    expect(formater(['a', 'b'])).toBe('a, b')
  })

  it('cite la première ligne d’un résultat dans un texte', () => {
    const requetes = new Map<string, EtatRequete>([
      ['total', { ok: true, resultat: { colonnes: [], lignes: [{ n: 1200 }], coupe: false } }],
      ['casse', { ok: false, erreur: 'x' }],
    ])
    expect(citer('**{{total.n}}** tickets, {{casse.n}}, {{total.z}}, {{absent.n}}', requetes, (v) => formater(v as number))).toBe('**1 200** tickets, [casse : erreur], [total.z ?], [absent : introuvable]')
  })
})
