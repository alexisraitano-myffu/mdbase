import type { AdaptateurFichiers } from './fichiers'

/** Un nom préfixé par « _ » désigne de la configuration, jamais une base (spec §3). */
export function estConfiguration(nom: string): boolean {
  return nom.startsWith('_')
}

/**
 * Dossiers de bases présents à la racine de l'espace. Toutes les bases sont à
 * plat à la racine ; les groupes n'existent que dans `_espace.yaml`.
 */
export async function listerBases(adaptateur: AdaptateurFichiers): Promise<string[]> {
  const entrees = await adaptateur.lister('')
  return entrees
    .filter((e) => e.type === 'dossier' && !estConfiguration(e.nom) && !e.nom.startsWith('.'))
    .map((e) => e.nom)
}
