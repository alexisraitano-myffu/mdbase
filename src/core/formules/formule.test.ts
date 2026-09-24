import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lireSchema, type Colonne } from '../schema'
import {
  afficherExpression,
  compiler,
  ErreurCalcul,
  ErreurFormule,
  evaluer,
  resoudreParNom,
  stockerExpression,
  typerFormules,
  type ValeurFormule,
} from './formule'

const { schema } = lireSchema(
  `version: 1
id: projets
nom: Projets
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - { cle: budget, nom: Budget, type: number }
  - { cle: depense, nom: Dépensé, type: number }
  - { cle: echeance, nom: Échéance, type: date }
  - { cle: urgent, nom: Urgent, type: checkbox }
  - cle: statut
    nom: Statut
    type: select
    options: [À faire, Terminé]
  - { cle: tags, nom: Tags, type: multiselect, options: [a] }
  - { cle: reste, nom: Reste, type: formula, expression: 'prop("budget") - prop("depense")' }
  - { cle: alerte, nom: Alerte, type: formula, expression: 'prop("reste") < 0' }
`,
  'projets',
)
const colonnes = schema!.colonnes
const env = { aujourdhui: '2026-09-24', maintenant: '2026-09-24T14:05' }
const parCle = (cle: string) => colonnes.find((c) => c.cle === cle)

/** Évalue une expression écrite avec les noms, sur une ligne donnée par clé. */
function calcul(expression: string, ligne: Record<string, ValeurFormule> = {}): ValeurFormule {
  const f = compiler(expression, resoudreParNom(colonnes))
  return evaluer(f, (c) => ligne[c.cle], env)
}
function erreur(expression: string): string {
  try {
    compiler(expression, resoudreParNom(colonnes))
  } catch (e) {
    if (e instanceof ErreurFormule) return e.message
    throw e
  }
  throw new Error(`aucune erreur pour ${expression}`)
}

describe('calcul', () => {
  it('arithmétique, priorités, parenthèses', () => {
    expect(calcul('1 + 2 * 3')).toBe(7)
    expect(calcul('(1 + 2) * 3')).toBe(9)
    expect(calcul('-2 * 3 + 10 % 4')).toBe(-4)
    expect(calcul('prop("Budget") / 4', { budget: 10 })).toBe(2.5)
  })

  it('un vide se propage dans les calculs au lieu d’une erreur', () => {
    expect(calcul('prop("Budget") * 2')).toBeUndefined()
    expect(calcul('prop("Budget") > 3')).toBeUndefined()
    expect(calcul('arrondi(prop("Budget"))')).toBeUndefined()
    expect(calcul('vide(prop("Budget"))')).toBe(true)
    expect(calcul('vide(prop("Titre"))', { titre: 'x' })).toBe(false)
  })

  it('logique : et, ou, non ; une condition vide compte comme fausse', () => {
    expect(calcul('prop("Urgent") et prop("Budget") > 5', { urgent: true, budget: 8 })).toBe(true)
    expect(calcul('non prop("Budget") > 5', { budget: 8 })).toBe(false)
    expect(calcul('si(prop("Budget") > 5, "gros", "petit")')).toBe('petit')
    expect(calcul('faux ou vrai')).toBe(true)
    expect(calcul('prop("Statut") == "Terminé"', { statut: 'Terminé' })).toBe(true)
  })

  it('si n’évalue que la branche choisie', () => {
    expect(calcul('si(vrai, 1, 1 / 0)')).toBe(1)
    expect(() => calcul('si(faux, 1, 1 / 0)')).toThrow(ErreurCalcul)
  })

  it('fonctions de nombres et de texte', () => {
    expect(calcul('arrondi(3.14159, 2)')).toBe(3.14)
    expect(calcul('arrondi(2.5)')).toBe(3)
    expect(calcul('abs(-4) + min(3, 1, 2) + max(1, 5)')).toBe(10)
    expect(calcul('concat("Reste : ", 1234.5, " € — ", vrai)')).toBe('Reste : 1234,5 € — oui')
    expect(calcul('longueur("été") + longueur(prop("Titre"))')).toBe(3)
    expect(calcul('majuscules("éa") == "ÉA"')).toBe(true)
  })

  it('dates : écart, ajouts, formats', () => {
    expect(calcul('ecart_jours(aujourdhui(), prop("Échéance"))', { echeance: '2026-10-01' })).toBe(7)
    expect(calcul('ajouter_jours("2026-02-27", 2)')).toBe('2026-03-01')
    expect(calcul('ajouter_jours(prop("Échéance"), 1)', { echeance: '2026-09-30T09:15' })).toBe('2026-10-01T09:15')
    expect(calcul('ajouter_mois("2026-01-31", 1)')).toBe('2026-02-28')
    expect(calcul('ajouter_mois("2026-11-15", 3)')).toBe('2027-02-15')
    expect(calcul('format_date(maintenant(), "JJ/MM/AA à HH:mm")')).toBe('24/09/26 à 14:05')
    expect(calcul('annee(aujourdhui()) * 100 + mois(aujourdhui())')).toBe(202609)
    expect(calcul('concat(aujourdhui())')).toBe('24/09/2026')
    // Un texte au format date se compare à une date.
    expect(calcul('prop("Échéance") < "2026-10-01"', { echeance: '2026-09-30' })).toBe(true)
    expect(erreur('prop("Échéance") < "demain"')).toBe('On ne peut pas comparer une date et du texte')
    expect(calcul('min(prop("Échéance"), aujourdhui())', { echeance: '2026-09-01' })).toBe('2026-09-01')
  })

  it('division par zéro : erreur de calcul, pas de résultat infini', () => {
    expect(() => calcul('1 / 0')).toThrow('Division par zéro')
    expect(() => calcul('prop("Budget") % 0', { budget: 3 })).toThrow(ErreurCalcul)
  })
})

describe('erreurs compréhensibles', () => {
  it('syntaxe', () => {
    expect(erreur('1 +')).toBe('La formule s’arrête trop tôt : il manque une valeur')
    expect(erreur('(1 + 2')).toBe('Parenthèse « ( » jamais fermée')
    expect(erreur('prop("Budget") = 2')).toBe('« = » inconnu : pour comparer, utilise « == »')
    expect(erreur('vrai && faux')).toBe('« && » inconnu : utilise « et »')
    expect(erreur('"abc')).toBe('Guillemet ouvert jamais fermé')
    expect(erreur('Budget * 2')).toBe('« Budget » inconnu : une colonne s’écrit prop("Budget"), une fonction Budget(…)')
    expect(erreur('1 2')).toBe('Suite inattendue : il manque peut-être un opérateur ou une virgule')
  })

  it('types', () => {
    expect(erreur('prop("Titre") + 1')).toBe('« + » s’applique à des nombres, pas à du texte ; pour assembler du texte, utilise concat(…)')
    expect(erreur('prop("Échéance") - aujourdhui()')).toBe('« - » s’applique à des nombres, pas à une date ; pour les dates, utilise ecart_jours ou ajouter_jours')
    expect(erreur('si(1, 2, 3)')).toBe('si : l’argument 1 doit être vrai ou faux, pas un nombre')
    expect(erreur('si(vrai, 2, "x")')).toBe('les deux résultats de si doivent être du même type (ici un nombre et du texte)')
    expect(erreur('prop("Budget") == "x"')).toBe('On ne peut pas comparer un nombre et du texte')
    expect(erreur('abs(1, 2)')).toBe('abs(x) attend 1 argument, pas 2')
    expect(erreur('arondi(1)')).toBe('Fonction « arondi » inconnue : voulais-tu dire arrondi ?')
    expect(erreur('prop("Inconnue")')).toBe('Colonne « Inconnue » introuvable')
  })

  it('colonnes multi-valeurs refusées (spec §6)', () => {
    expect(erreur('prop("Tags")')).toBe('« Tags » : cette colonne contient plusieurs valeurs, passe par un rollup (compter, somme…)')
  })

  it('l’erreur donne la position fautive', () => {
    try {
      compiler('1 + prop("Titre")', resoudreParNom(colonnes))
    } catch (e) {
      expect((e as ErreurFormule).position).toEqual({ debut: 0, fin: 17 })
    }
    try {
      compiler('abs(prop("Inconnue"))', resoudreParNom(colonnes))
    } catch (e) {
      expect((e as ErreurFormule).position).toEqual({ debut: 4, fin: 20 })
    }
  })
})

describe('invariant 8 : aucune formule n’exécute de code', () => {
  it('le moteur n’utilise ni eval, ni Function, ni with', () => {
    const dossier = dirname(fileURLToPath(import.meta.url))
    for (const f of readdirSync(dossier).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const source = readFileSync(join(dossier, f), 'utf8')
      expect(source, f).not.toMatch(/\beval\s*\(|new\s+Function|\bFunction\s*\(|\bwith\s*\(|\bimport\s*\(/)
    }
  })

  it('les noms JavaScript ne sont ni des fonctions ni des colonnes', () => {
    for (const e of ['constructor("x")', 'toString()', '__proto__()', 'hasOwnProperty("si")', 'alert(1)', 'window', 'this']) {
      expect(() => compiler(e, resoudreParNom(colonnes)), e).toThrow(ErreurFormule)
    }
    expect(() => compiler('prop("__proto__")', parCle)).toThrow('Colonne « __proto__ » introuvable')
    expect(() => compiler('prop("constructor")', parCle)).toThrow(ErreurFormule)
  })

  it('le texte est une valeur, jamais du code', () => {
    expect(calcul('concat("alert(1)", "${1+1}")')).toBe('alert(1)${1+1}')
  })
})

describe('schéma', () => {
  it('le type des formules est déduit à la lecture, formule de formule comprise', () => {
    const f = (cle: string) => parCle(cle) as Extract<Colonne, { type: 'formula' }>
    expect(f('reste').resultat).toBe('nombre')
    expect(f('alerte').resultat).toBe('case')
  })

  it('une formule en boucle ou en erreur n’a pas de type', () => {
    const types = typerFormules([
      { cle: 'a', nom: 'A', type: 'formula', expression: 'prop("b") + 1' },
      { cle: 'b', nom: 'B', type: 'formula', expression: 'prop("a") + 1' },
      { cle: 'c', nom: 'C', type: 'formula', expression: '1 +' },
    ])
    expect(types.get('a')).toMatch(/boucle|erreur/)
    expect(types.get('c')).toBe('La formule s’arrête trop tôt : il manque une valeur')
  })

  it('l’éditeur montre les noms, le fichier garde les clés', () => {
    const stockee = 'si(prop("depense") > prop("budget"), "dépassé", "ok")'
    const affichee = afficherExpression(stockee, colonnes)
    expect(affichee).toBe('si(prop("Dépensé") > prop("Budget"), "dépassé", "ok")')
    expect(stockerExpression(affichee, colonnes)).toBe(stockee)
    // Une référence inconnue ou une expression invalide restent telles quelles.
    expect(stockerExpression('prop("Nope") +', colonnes)).toBe('prop("Nope") +')
  })
})
