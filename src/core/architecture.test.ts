// Garde-fou d'architecture (spec §12) : le cœur n'importe que le cœur et une
// liste fermée de librairies sans dépendance au navigateur. Le tsconfig du
// cœur (sans DOM ni types Node) couvre les globales ; ce test couvre les imports.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const LIBRAIRIES_AUTORISEES = new Set(['yaml', 'minisearch'])
const CORE = dirname(fileURLToPath(import.meta.url))

function fichiersDuCoeur(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name)
    if (e.isDirectory()) return fichiersDuCoeur(chemin)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [chemin] : []
  })
}

it("le cœur n'importe ni UI, ni navigateur, ni Node", () => {
  const violations: string[] = []
  for (const fichier of fichiersDuCoeur(CORE)) {
    const source = readFileSync(fichier, 'utf8')
    for (const [, cible] of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (!cible) continue
      const ok = cible.startsWith('.')
        ? !relative(CORE, resolve(dirname(fichier), cible)).startsWith('..')
        : LIBRAIRIES_AUTORISEES.has(cible)
      if (!ok) violations.push(`${relative(CORE, fichier)} importe « ${cible} »`)
    }
  }
  expect(violations).toEqual([])
})
