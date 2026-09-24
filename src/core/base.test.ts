import { describe, expect, it } from 'vitest'
import { AdaptateurMemoire } from './adaptateur-memoire'
import { chargerBase, enregistrerLigne, type BaseChargee } from './base'
import { TEXTE_SCHEMA_PROJETS } from './fixtures/schema-projets'

function espace(horloge?: () => number) {
  return new AdaptateurMemoire(
    {
      'projets/_schema.yaml': TEXTE_SCHEMA_PROJETS,
      'projets/_vues/tableau.yaml': 'id: tableau\n',
      'projets/navi--k2x9m4pq.md': '---\nid: k2x9m4pq\ntitre: Navi\nstatut: En cours\n---\n',
      'projets/sinam--p4m1z8rt.md': '---\nid: p4m1z8rt\ntitre: sinam\nbudget: beaucoup\n---\n',
      'projets/note-libre.md': '# pas une ligne\n',
      'projets/copie--k2x9m4pq.md': '---\nid: k2x9m4pq\ntitre: Navi copie\n---\n',
      'projets/image.png': '',
    },
    horloge,
  )
}

async function charger(a: AdaptateurMemoire): Promise<BaseChargee> {
  const r = await chargerBase(a, 'projets')
  if (!r.ok) throw new Error(r.raison)
  return r.base
}

describe('chargerBase', () => {
  it('lit les lignes, signale les fichiers non reconnus, ignore la configuration et le non-Markdown', async () => {
    const base = await charger(espace())
    expect(base.lignes.map((l) => l.chemin).sort()).toEqual([
      'projets/copie--k2x9m4pq.md',
      'projets/navi--k2x9m4pq.md',
      'projets/sinam--p4m1z8rt.md',
    ])
    expect(base.nonReconnus).toEqual([{ chemin: 'projets/note-libre.md', raison: 'pas de frontmatter' }])
  })

  it('garde les deux lignes d’un id en double, sans en écraser une', async () => {
    const base = await charger(espace())
    expect(base.lignes.filter((l) => l.id === 'k2x9m4pq')).toHaveLength(2)
  })

  it('garde une valeur invalide avec son avertissement', async () => {
    const sinam = (await charger(espace())).lignes.find((l) => l.id === 'p4m1z8rt')!
    expect(sinam.cellules.budget).toMatchObject({ etat: 'invalide', brut: 'beaucoup' })
  })

  it('refuse un dossier sans schéma', async () => {
    const a = new AdaptateurMemoire({ 'vrac/a.md': '---\nid: a\n---\n' })
    expect(await chargerBase(a, 'vrac')).toEqual({ ok: false, raison: 'pas de _schema.yaml' })
  })
})

describe('enregistrerLigne', () => {
  it('écrit la modification et renvoie la ligne relue', async () => {
    const a = espace()
    const base = await charger(a)
    const navi = base.lignes.find((l) => l.chemin === 'projets/navi--k2x9m4pq.md')!
    const apres = await enregistrerLigne(a, base.schema, navi, { statut: 'Terminé' })
    expect(apres.cellules.statut).toEqual({ etat: 'ok', valeur: 'Terminé' })
    expect(await a.lire(navi.chemin)).toBe('---\nid: k2x9m4pq\ntitre: Navi\nstatut: Terminé\n---\n')
  })

  it('réapplique seulement sa modification si le fichier a changé sur le disque', async () => {
    let t = 1
    const a = espace(() => t)
    const base = await charger(a)
    const navi = base.lignes.find((l) => l.chemin === 'projets/navi--k2x9m4pq.md')!

    // La synchro apporte une modification faite sur une autre machine.
    t = 2
    await a.ecrire(navi.chemin, '---\nid: k2x9m4pq\ntitre: Navi (renommé ailleurs)\nstatut: En cours\n---\nCorps ajouté\n')

    t = 3
    const apres = await enregistrerLigne(a, base.schema, navi, { statut: 'Terminé' })
    expect(await a.lire(navi.chemin)).toBe(
      '---\nid: k2x9m4pq\ntitre: Navi (renommé ailleurs)\nstatut: Terminé\n---\nCorps ajouté\n',
    )
    expect(apres.date).toBe(3)
  })
})
