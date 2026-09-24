import { describe, expect, it } from 'vitest'
import { cleColonne, genererId, idBase, nomFichierLigne, slug } from './identifiants'

function aleatoireFixe(...suites: number[][]) {
  let i = 0
  return (n: number) => Uint8Array.from(suites[i++ % suites.length]!.slice(0, n))
}

describe('genererId', () => {
  it('produit 8 caractères [a-z0-9] commençant par une lettre', () => {
    const id = genererId(aleatoireFixe([27, 1, 2, 3, 30, 31, 35, 200]))
    expect(id).toMatch(/^[a-z][a-z0-9]{7}$/)
  })

  it('recommence si l’id existe déjà', () => {
    const a = [0, 0, 0, 0, 0, 0, 0, 0]
    const b = [1, 1, 1, 1, 1, 1, 1, 1]
    expect(genererId(aleatoireFixe(a, b), new Set(['aaaaaaaa']))).toBe('bbbbbbbb')
  })
})

describe('noms de fichiers', () => {
  it('slugifie accents, ponctuation et espaces', () => {
    expect(slug('  Réunion : équipe Été 2026 ! ')).toBe('reunion-equipe-ete-2026')
  })

  it('assemble slug et id', () => {
    expect(nomFichierLigne('Navi', 'k2x9m4pq')).toBe('navi--k2x9m4pq.md')
    expect(nomFichierLigne('', 'k2x9m4pq')).toBe('k2x9m4pq.md')
    expect(nomFichierLigne('!!!', 'k2x9m4pq')).toBe('k2x9m4pq.md')
  })

  it('borne la longueur du slug', () => {
    expect(slug('a'.repeat(200)).length).toBe(60)
  })
})

describe('clés de colonnes et ids de bases', () => {
  it('dérive une clé snake_case unique, jamais « id »', () => {
    expect(cleColonne('Date de fin', [])).toBe('date_de_fin')
    expect(cleColonne('Statut', ['statut'])).toBe('statut_2')
    expect(cleColonne('Statut', ['statut', 'statut_2'])).toBe('statut_3')
    expect(cleColonne('Id', [])).toBe('id_2')
    expect(cleColonne('???', [])).toBe('colonne')
  })

  it('dérive un id de base unique', () => {
    expect(idBase('Tâches perso', [])).toBe('taches-perso')
    expect(idBase('Projets', ['projets'])).toBe('projets-2')
    expect(idBase('_config', [])).toBe('config')
    expect(idBase('', [])).toBe('base')
  })
})
