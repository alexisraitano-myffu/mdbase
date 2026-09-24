import { FichierIntrouvable, joindre, type AdaptateurFichiers } from './fichiers'
import { estConfiguration } from './espace'
import { lireLigne, reecrireLigne, type Ligne, type Modifications } from './ligne'
import { lireSchema, type Schema } from './schema'

export type FichierNonReconnu = { chemin: string; raison: string }

/** Une ligne chargée, avec la date de modification lue (pour l'écriture sûre). */
export type LigneChargee = Ligne & { date: number }

export type BaseChargee = {
  schema: Schema
  /** Toutes les lignes lues, dans l'ordre des fichiers. Un id en double donne deux lignes. */
  lignes: LigneChargee[]
  nonReconnus: FichierNonReconnu[]
  avertissements: string[]
}

export type ChargementBase = { ok: true; base: BaseChargee } | { ok: false; raison: string }

export async function chargerBase(adaptateur: AdaptateurFichiers, idBase: string): Promise<ChargementBase> {
  let texteSchema: string
  try {
    texteSchema = await adaptateur.lire(joindre(idBase, '_schema.yaml'))
  } catch (e) {
    if (e instanceof FichierIntrouvable) return { ok: false, raison: 'pas de _schema.yaml' }
    throw e
  }
  const { schema, avertissements } = lireSchema(texteSchema, idBase)
  if (!schema) return { ok: false, raison: avertissements.join(' ; ') }

  const lignes: LigneChargee[] = []
  const nonReconnus: FichierNonReconnu[] = []
  for (const entree of await adaptateur.lister(idBase)) {
    if (entree.type !== 'fichier' || estConfiguration(entree.nom) || !entree.nom.endsWith('.md')) continue
    const chemin = joindre(idBase, entree.nom)
    const date = await adaptateur.dateModification(chemin)
    const lecture = lireLigne(chemin, await adaptateur.lire(chemin), schema)
    if (lecture.ok) lignes.push({ ...lecture.ligne, date })
    else nonReconnus.push({ chemin, raison: lecture.raison })
  }
  return { ok: true, base: { schema, lignes, nonReconnus, avertissements } }
}

/**
 * Écrit des modifications sur une ligne (spec §4, « écriture sûre ») : si le
 * fichier a changé sur le disque depuis la lecture, il est relu et seules les
 * modifications demandées sont réappliquées sur la version du disque.
 *
 * Renvoie la ligne à jour, ou une erreur si le fichier n'est plus une ligne lisible.
 */
export async function enregistrerLigne(
  adaptateur: AdaptateurFichiers,
  schema: Schema,
  ligne: LigneChargee,
  modifs: Modifications,
  corps?: string,
): Promise<LigneChargee> {
  const dateDisque = await adaptateur.dateModification(ligne.chemin)
  const source = dateDisque === ligne.date ? ligne.source : await adaptateur.lire(ligne.chemin)
  const texte = reecrireLigne(source, schema, modifs, corps)
  await adaptateur.ecrire(ligne.chemin, texte)
  const relue = lireLigne(ligne.chemin, texte, schema)
  if (!relue.ok) throw new Error(`Relecture impossible après écriture : ${relue.raison}`)
  return { ...relue.ligne, date: await adaptateur.dateModification(ligne.chemin) }
}
