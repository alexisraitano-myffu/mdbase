import { parse } from 'yaml'
import { chargerBase, type LigneChargee } from '../base'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from '../fichiers'
import { genererId, nomFichierLigne, type Aleatoire } from '../identifiants'
import { creerLigne, reecrireLigne, type Modifications } from '../ligne'
import { colonne, estObjet, lireSchema, type Schema } from '../schema'
import { modifierSchema } from '../schema-ecriture'
import { listerBases } from '../espace'
import type { Valeur } from '../valeurs'
import { champsDemandes, COLONNES_JIRA, changement, memeValeur, valeursTicket, type TicketJira } from './ticket'

// Synchro d'une base Jira (§16) : lit Jira par un client injecté (le cœur ne
// fait pas de réseau) et écrit les tickets en lignes, en ne réécrivant que ce
// qui a changé. Un ticket n'est jamais effacé : sorti de la sélection, il
// passe à `suivi: false`.

export const FICHIER_SYNCHRO = '_synchro.yaml'

/** Ce que le script sait faire avec Jira : une page de recherche JQL, et trouver le champ Sprint. */
export interface ClientJira {
  chercher(jql: string, champs: string[], suivant?: string): Promise<{ tickets: TicketJira[]; suivant?: string }>
  champSprint(): Promise<string | undefined>
}

/** État de la dernière synchro, écrit dans `<base>/_synchro.yaml` et affiché par l'app. */
export type EtatSynchro = {
  /** Date et heure locales de la dernière synchro réussie, « AAAA-MM-JJTHH:mm ». */
  derniere?: string
  /** Projets et filtre de cette synchro : s'ils changent, la suivante est complète. */
  signature?: string
  tickets?: number
  erreur?: string
}

export type Bilan = { nouveaux: number; modifies: number; sortis: number; lus: number; complete: boolean }

export type OptionsSynchro = {
  /** Date et heure locales, « AAAA-MM-JJTHH:mm ». */
  maintenant: () => string
  aleatoire: Aleatoire
  /** Forcer une synchro complète (sinon : seulement si c'est la première, ou si la sélection a changé). */
  complete?: boolean
}

/** Bases Jira de l'espace (schéma avec `source: { type: jira }`). */
export async function basesJira(a: AdaptateurFichiers): Promise<{ id: string; schema: Schema }[]> {
  const trouvees: { id: string; schema: Schema }[] = []
  for (const id of await listerBases(a)) {
    let texte: string
    try {
      texte = await a.lire(joindre(id, '_schema.yaml'))
    } catch (e) {
      if (e instanceof FichierIntrouvable) continue
      throw e
    }
    const { schema } = lireSchema(texte, id)
    if (schema?.source?.type === 'jira') trouvees.push({ id, schema })
  }
  return trouvees
}

export function lireEtatSynchro(texte: string | null): EtatSynchro {
  if (texte === null) return {}
  let brut: unknown
  try {
    brut = parse(texte)
  } catch {
    return {}
  }
  if (!estObjet(brut)) return {}
  return {
    ...(typeof brut.derniere === 'string' && { derniere: brut.derniere }),
    ...(typeof brut.signature === 'string' && { signature: brut.signature }),
    ...(typeof brut.tickets === 'number' && { tickets: brut.tickets }),
    ...(typeof brut.erreur === 'string' && { erreur: brut.erreur }),
  }
}

export function ecrireEtatSynchro(e: EtatSynchro): string {
  const lignes = ['# Écrit par le script de synchro Jira (mdbase-jira). Ne pas modifier.']
  if (e.derniere) lignes.push(`derniere: "${e.derniere}"`)
  if (e.signature) lignes.push(`signature: ${JSON.stringify(e.signature)}`)
  if (e.tickets !== undefined) lignes.push(`tickets: ${e.tickets}`)
  if (e.erreur) lignes.push(`erreur: ${JSON.stringify(e.erreur)}`)
  return lignes.join('\n') + '\n'
}

/** Requête JQL de la sélection ; `depuis` limite aux tickets mis à jour après cette date (« AAAA/MM/JJ HH:mm »). */
export function jqlSelection(projets: readonly string[], jql: string | undefined, depuis?: string): string {
  const parties = [`project in (${projets.map((p) => JSON.stringify(p)).join(', ')})`]
  if (jql) parties.push(`(${jql})`)
  if (depuis) parties.push(`updated >= "${depuis}"`)
  return `${parties.join(' AND ')} ORDER BY updated ASC`
}

/**
 * Borne de la synchro incrémentale : un jour avant la dernière synchro. La
 * marge couvre un décalage de fuseau entre ce poste et le profil Jira ; relire
 * un ticket inchangé ne réécrit rien.
 */
export function depuisPour(derniere: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(derniere)
  if (!m) return undefined
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 24 * 3600 * 1000)
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}/${deux(d.getUTCMonth() + 1)}/${deux(d.getUTCDate())} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}`
}

export async function synchroniser(a: AdaptateurFichiers, base: string, client: ClientJira, o: OptionsSynchro): Promise<Bilan> {
  const chemin = joindre(base, FICHIER_SYNCHRO)
  const etat = lireEtatSynchro(await lireOuNull(a, chemin))
  try {
    const bilan = await synchroniserSansEtat(a, base, client, o, etat)
    return bilan
  } catch (e) {
    await a.ecrire(chemin, ecrireEtatSynchro({ ...etat, erreur: (e as Error).message }))
    throw e
  }
}

async function synchroniserSansEtat(a: AdaptateurFichiers, base: string, client: ClientJira, o: OptionsSynchro, etat: EtatSynchro): Promise<Bilan> {
  const chargement = await chargerBase(a, base)
  if (!chargement.ok) throw new Error(`Base ${base} illisible : ${chargement.raison}`)
  const source = chargement.base.schema.source
  if (source?.type !== 'jira') throw new Error(`La base ${base} n'est pas une base Jira`)
  if (!source.site) throw new Error('Site Jira manquant dans les réglages de la base')
  if (source.projets.length === 0) throw new Error('Aucun projet suivi : choisis-en dans les réglages de la base Jira')

  // 0. Colonnes ajoutées au script depuis la création de la base (ex. Projet) :
  // posées dans le schéma, et une synchro complète les remplit pour tous les tickets.
  let schema = chargement.base.schema
  let texteSchema = await a.lire(joindre(base, '_schema.yaml'))
  const avant = texteSchema
  const manquantes = COLONNES_JIRA.filter((c) => !schema.colonnes.some((x) => x.cle === c.cle))
  for (const colonne of manquantes) texteSchema = modifierSchema(texteSchema, { type: 'ajouter_colonne', colonne })
  if (manquantes.length > 0) schema = lireSchema(texteSchema, base).schema!

  const maintenant = o.maintenant()
  const signature = JSON.stringify([source.site, source.projets, source.jql ?? ''])
  const complete = o.complete || !etat.derniere || etat.signature !== signature || manquantes.length > 0
  const depuis = complete ? undefined : depuisPour(etat.derniere!)

  // 1. Lecture de Jira, page par page.
  const champSprint = await client.champSprint()
  const champs = champsDemandes(champSprint)
  const jql = jqlSelection(source.projets, source.jql, depuis)
  const tickets: TicketJira[] = []
  let suivant: string | undefined
  do {
    const page = await client.chercher(jql, champs, suivant)
    tickets.push(...page.tickets)
    suivant = page.suivant
  } while (suivant)

  // 2. Options des select : complétées dans le schéma avant d'écrire les lignes.
  const converties = tickets.map((t) => ({ t, ...valeursTicket(t, source.site, champSprint) }))
  for (const c of schema.colonnes) {
    if (c.type !== 'select' && c.type !== 'multiselect') continue
    const connues = new Set(c.options.map((x) => x.label))
    for (const { valeurs, couleurs } of converties) {
      const v = valeurs[c.cle]
      for (const label of Array.isArray(v) ? v : typeof v === 'string' ? [v] : []) {
        if (connues.has(label)) continue
        connues.add(label)
        const couleur = c.cle === 'statut' ? couleurs.get(label) : undefined
        texteSchema = modifierSchema(texteSchema, { type: 'ajouter_option', cle: c.cle, option: { label, ...(couleur && { couleur }) } })
      }
    }
  }
  if (texteSchema !== avant) {
    await a.ecrire(joindre(base, '_schema.yaml'), texteSchema)
    schema = lireSchema(texteSchema, base).schema!
  }

  // 3. Lignes : retrouvées par `jira_id`, jamais par nom de fichier.
  const parJiraId = new Map<string, LigneChargee>()
  for (const l of chargement.base.lignes) {
    const c = l.cellules.jira_id
    if (c?.etat === 'ok' && typeof c.valeur === 'string' && !parJiraId.has(c.valeur)) parJiraId.set(c.valeur, l)
  }
  const ids = new Set(chargement.base.lignes.map((l) => l.id))
  const vus = new Set<string>()
  const bilan: Bilan = { nouveaux: 0, modifies: 0, sortis: 0, lus: tickets.length, complete }

  for (const { valeurs: brutes, corps } of converties) {
    const valeurs = gardees(schema, brutes)
    const jiraId = String(brutes.jira_id)
    vus.add(jiraId)
    const ligne = parJiraId.get(jiraId)
    if (!ligne) {
      const id = genererId(o.aleatoire, ids)
      ids.add(id)
      const titre = String(valeurs.titre ?? id)
      await a.ecrire(joindre(base, nomFichierLigne(titre, id)), creerLigne(schema, id, gardees(schema, { ...valeurs, bouge: maintenant, changement: 'Nouveau' }), corps))
      bilan.nouveaux++
      continue
    }
    const actuelles = valeursDe(ligne)
    const modifs: Modifications = {}
    for (const [cle, v] of Object.entries(valeurs)) if (!memeValeur(actuelles[cle], v)) modifs[cle] = v
    const nouveauCorps = corps.trim() === ligne.corps.trim() ? undefined : corps
    if (Object.keys(modifs).length === 0 && nouveauCorps === undefined) continue
    // Une colonne tout juste ajoutée se remplit sans compter comme un mouvement du ticket.
    const reference = { ...actuelles, ...Object.fromEntries(manquantes.map((c) => [c.cle, valeurs[c.cle]])) }
    const quoi = changement(reference, { ...actuelles, ...valeurs }) ?? (actuelles.suivi !== true ? 'De retour dans la sélection' : null)
    if (quoi) Object.assign(modifs, gardees(schema, { bouge: maintenant, changement: quoi }))
    await ecrireLigne(a, base, schema, ligne, modifs, nouveauCorps)
    bilan.modifies++
  }

  // 4. Synchro complète : les tickets suivis qui n'ont pas été vus sortent de la sélection.
  if (complete) {
    for (const [jiraId, ligne] of parJiraId) {
      if (vus.has(jiraId) || valeursDe(ligne).suivi !== true) continue
      await ecrireLigne(a, base, schema, ligne, gardees(schema, { suivi: false, bouge: maintenant, changement: 'Sorti de la sélection (projet, filtre ou ticket supprimé)' }))
      bilan.sortis++
    }
  }

  const total = complete ? vus.size : (etat.tickets ?? 0) + bilan.nouveaux
  await a.ecrire(joindre(base, FICHIER_SYNCHRO), ecrireEtatSynchro({ derniere: maintenant, signature, tickets: total }))
  return bilan
}

/** Réécrit une ligne ; le fichier est renommé si son titre a changé (spec §3). */
async function ecrireLigne(a: AdaptateurFichiers, base: string, schema: Schema, ligne: LigneChargee, modifs: Modifications, corps?: string) {
  await a.ecrire(ligne.chemin, reecrireLigne(ligne.source, schema, modifs, corps))
  if (typeof modifs.titre === 'string') {
    const nouveau = joindre(base, nomFichierLigne(modifs.titre, ligne.id))
    if (nouveau !== ligne.chemin) await a.renommer(ligne.chemin, nouveau)
  }
}

/** Seules les colonnes encore présentes au schéma sont écrites (une colonne retirée n'est plus remplie). */
function gardees(schema: Schema, valeurs: Record<string, Valeur | undefined>): Modifications {
  return Object.fromEntries(Object.entries(valeurs).filter(([cle]) => colonne(schema, cle) !== undefined))
}

function valeursDe(l: LigneChargee): Record<string, Valeur | undefined> {
  return Object.fromEntries(Object.entries(l.cellules).map(([cle, c]) => [cle, c?.etat === 'ok' ? c.valeur : undefined]))
}

async function lireOuNull(a: AdaptateurFichiers, chemin: string): Promise<string | null> {
  try {
    return await a.lire(chemin)
  } catch (e) {
    if (e instanceof FichierIntrouvable) return null
    throw e
  }
}
