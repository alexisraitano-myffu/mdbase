import { lireModele, type Modele } from '../core/modeles'

// Modèles livrés avec l'app (spec §19 « Modèles ») : les dossiers `modeles/<id>/`
// du dépôt, embarqués au build comme la démo.

const PREFIXE = '../../modeles/'
const FICHIERS = import.meta.glob('../../modeles/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function regrouper(): Modele[] {
  const parModele = new Map<string, Record<string, string>>()
  for (const [source, texte] of Object.entries(FICHIERS)) {
    const [id, ...reste] = source.slice(PREFIXE.length).split('/')
    if (!id || reste.length === 0) continue
    parModele.set(id, { ...parModele.get(id), [reste.join('/')]: texte })
  }
  return [...parModele].map(([id, fichiers]) => lireModele(id, fichiers))
}

export const MODELES: readonly Modele[] = regrouper()
