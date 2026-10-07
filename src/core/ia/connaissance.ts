import MiniSearch from 'minisearch'
import { parseDocument, stringify } from 'yaml'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from '../fichiers'
import { slug } from '../identifiants'
import { estObjet } from '../schema'
import type { AppelOutil, DefinitionOutil } from './modele'
import { erreur, ErreurProposition, normaliser, texteRequis } from './references'

// Connaissance de l'assistant (spec §18) : le contexte (`_assistant/contexte.md`,
// envoyé à chaque demande), les documents (`_assistant/documents/`, cherchés
// par outils) et l'inbox (`_assistant/inbox/`, en attente de traitement ;
// `_assistant/inbox/traites/`, l'historique de ce qui en a été fait).
// Comme toute configuration, relus sur le disque avant d'être modifiés.

const DOSSIER = '_assistant'
export const FICHIER_CONTEXTE = joindre(DOSSIER, 'contexte.md')
const DOSSIER_DOCUMENTS = joindre(DOSSIER, 'documents')
const DOSSIER_INBOX = joindre(DOSSIER, 'inbox')
const DOSSIER_TRAITES = joindre(DOSSIER_INBOX, 'traites')

/** Un document : du Markdown (converti à l'ajout) et ce qu'on sait de lui. */
export type DocumentConnaissance = {
  /** Nom du fichier sans `.md` : `<date>--<slug>`. */
  id: string
  titre: string
  /** Nom du fichier d'origine ; absent pour un texte collé. */
  source?: string
  /** Date de l'information (AAAA-MM-JJ). */
  date: string
  /** Date et heure de l'ajout (AAAA-MM-JJTHH:MM). */
  ajoute: string
  /** Lignes concernées, `base/id`. */
  lignes: string[]
  /** Document qui le remplace : il n'est plus cherché par défaut. */
  remplacePar?: string
  texte: string
}

/** Un élément de l'inbox : une remarque, un texte collé ou un fichier converti. */
export type ElementInbox = {
  /** Nom du fichier sans `.md` : `<horodatage>--<slug>`. */
  id: string
  titre: string
  source?: string
  /** Date et heure de réception (AAAA-MM-JJTHH:MM). */
  recu: string
  /** Question de l'assistant, quand il n'a pas su le rattacher. */
  question?: string
  texte: string
}

/** Un élément traité : gardé dans l'historique avec ce qui en a été fait. */
export type ElementTraite = ElementInbox & {
  /** Date et heure du traitement (AAAA-MM-JJTHH:MM). */
  traite: string
  /** Ce qui a été fait, en phrases lisibles. */
  bilan: string[]
  /** Document où le fichier a été rangé : son texte n'est pas recopié dans l'historique. */
  document?: string
}

export type Connaissance = { contexte: string; documents: DocumentConnaissance[]; inbox: ElementInbox[]; traites: ElementTraite[] }

/** Ce qu'un plan a fait par ailleurs (lignes, pages, structure) et ce qu'il signale : le bilan des éléments qu'il traite. */
export type BilanPlan = { commun: string[]; incoherences: readonly Incoherence[] }

/** Ce qu'un plan fait de l'inbox, appliqué après le reste (spec §18). */
export type ActionConnaissance =
  | {
      type: 'classer'
      element: string
      titreElement: string
      /** Gardé comme document (présentation, compte rendu, mail), ou retiré (remarque reportée dans les pages). */
      garder: boolean
      titre: string
      date: string
      lignes: string[]
      /** Documents remplacés par celui-ci. */
      remplace: { id: string; titre: string }[]
    }
  | { type: 'attente'; element: string; titreElement: string; question: string }

/** Écart entre deux sources, signalé et jamais appliqué. */
export type Incoherence = { constat: string; source?: string }

const ENTETE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const texteOuRien = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : undefined)

function lireEntete(texte: string): { entete: Record<string, unknown>; corps: string } {
  const m = ENTETE.exec(texte)
  if (!m) return { entete: {}, corps: texte }
  try {
    const e = parseDocument(m[1]!).toJS()
    return { entete: estObjet(e) ? e : {}, corps: m[2]! }
  } catch {
    return { entete: {}, corps: m[2]! }
  }
}

const ecrireEntete = (entete: Record<string, unknown>, corps: string) =>
  `---\n${stringify(Object.fromEntries(Object.entries(entete).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)))).trimEnd()}\n---\n\n${corps.trim()}\n`

/** Date AAAA-MM-JJ d'un texte YAML (une date nue est lue comme un objet Date). */
function lireJour(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const t = texteOuRien(v)
  return t && DATE.test(t.slice(0, 10)) ? t.slice(0, 10) : undefined
}

export function lireDocument(id: string, texte: string): DocumentConnaissance {
  const { entete, corps } = lireEntete(texte)
  const ajoute = texteOuRien(entete.ajoute) ?? ''
  const date = lireJour(entete.date) ?? lireJour(ajoute) ?? lireJour(id) ?? ''
  const lignes = Array.isArray(entete.lignes) ? entete.lignes.flatMap((l) => texteOuRien(l) ?? []) : []
  const doc: DocumentConnaissance = { id, titre: texteOuRien(entete.titre) ?? id, date, ajoute, lignes, texte: corps.trim() }
  const source = texteOuRien(entete.source)
  const remplacePar = texteOuRien(entete.remplace_par)
  return { ...doc, ...(source ? { source } : {}), ...(remplacePar ? { remplacePar } : {}) }
}

export function ecrireDocument(d: DocumentConnaissance): string {
  return ecrireEntete({ titre: d.titre, source: d.source, date: d.date, ajoute: d.ajoute, lignes: d.lignes, remplace_par: d.remplacePar }, d.texte)
}

export function lireElement(id: string, texte: string): ElementInbox {
  const { entete, corps } = lireEntete(texte)
  const el: ElementInbox = { id, titre: texteOuRien(entete.titre) ?? id, recu: texteOuRien(entete.recu) ?? '', texte: corps.trim() }
  const source = texteOuRien(entete.source)
  const question = texteOuRien(entete.question)
  return { ...el, ...(source ? { source } : {}), ...(question ? { question } : {}) }
}

export function ecrireElement(e: ElementInbox): string {
  return ecrireEntete({ titre: e.titre, source: e.source, recu: e.recu, question: e.question }, e.texte)
}

export function lireElementTraite(id: string, texte: string): ElementTraite {
  const { entete } = lireEntete(texte)
  const el = lireElement(id, texte)
  const bilan = Array.isArray(entete.bilan) ? entete.bilan.flatMap((l) => texteOuRien(l) ?? []) : []
  const document = texteOuRien(entete.document)
  return { ...el, traite: texteOuRien(entete.traite) ?? '', bilan, ...(document ? { document } : {}) }
}

export function ecrireElementTraite(e: ElementTraite): string {
  return ecrireEntete({ titre: e.titre, source: e.source, recu: e.recu, question: e.question, traite: e.traite, bilan: e.bilan, document: e.document }, e.texte)
}

/**
 * Ajoute une entrée datée à une section du corps d'une page (`## Section`),
 * créée en fin de page si elle manque ; le reste de la page ne bouge pas.
 */
export function insererRemarque(corps: string, section: string | undefined, entree: string): string {
  const ligne = `- ${entree.replace(/\s*\n\s*/g, ' ').trim()}`
  const texte = corps.trimEnd()
  if (!section) return texte === '' ? `${ligne}\n` : `${texte}\n\n${ligne}\n`
  const lignes = texte === '' ? [] : texte.split('\n')
  const debut = lignes.findIndex((l) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l)
    return m !== null && normaliser(m[2]!) === normaliser(section)
  })
  if (debut < 0) return `${texte === '' ? '' : `${texte}\n\n`}## ${section}\n\n${ligne}\n`
  const niveau = /^(#+)/.exec(lignes[debut]!)![1]!.length
  let fin = lignes.length
  for (let i = debut + 1; i < lignes.length; i++) {
    const m = /^(#{1,6})\s/.exec(lignes[i]!)
    if (m && m[1]!.length <= niveau) {
      fin = i
      break
    }
  }
  // Après la dernière ligne non vide de la section.
  let ou = fin
  while (ou > debut + 1 && lignes[ou - 1]!.trim() === '') ou--
  const apres = lignes.slice(ou)
  const resultat = [...lignes.slice(0, ou), ...(ou === debut + 1 ? [''] : []), ligne, ...(apres.length > 0 && apres[0]!.trim() !== '' ? [''] : []), ...apres]
  return `${resultat.join('\n')}\n`
}

const deux = (n: number) => String(n).padStart(2, '0')

export class ConnaissanceAssistant {
  private file: Promise<unknown> = Promise.resolve()

  constructor(private readonly adaptateur: AdaptateurFichiers) {}

  async lire(): Promise<Connaissance> {
    const [contexte, documents, inbox, traites] = await Promise.all([
      this.lireOuNull(FICHIER_CONTEXTE),
      this.lireDossier(DOSSIER_DOCUMENTS, lireDocument),
      this.lireDossier(DOSSIER_INBOX, lireElement),
      this.lireDossier(DOSSIER_TRAITES, lireElementTraite),
    ])
    return {
      contexte: (contexte ?? '').trim(),
      documents: documents.sort((a, b) => b.date.localeCompare(a.date) || b.ajoute.localeCompare(a.ajoute)),
      inbox: inbox.sort((a, b) => a.recu.localeCompare(b.recu) || a.id.localeCompare(b.id)),
      traites: traites.sort((a, b) => b.traite.localeCompare(a.traite) || b.id.localeCompare(a.id)),
    }
  }

  ecrireContexte(texte: string): Promise<void> {
    return this.enFile(() => this.adaptateur.ecrire(FICHIER_CONTEXTE, `${texte.trim()}\n`))
  }

  /** Dépose un élément dans l'inbox ; `maintenant` : AAAA-MM-JJTHH:MM:SS. */
  deposer(e: { titre: string; texte: string; source?: string }, maintenant: string): Promise<ElementInbox> {
    return this.enFile(async () => {
      const horodatage = maintenant.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      const base = `${horodatage}--${slug(e.titre).slice(0, 50) || 'element'}`
      const existants = new Set([...(await this.lister(DOSSIER_INBOX)), ...(await this.lister(DOSSIER_TRAITES))].map((n) => n.replace(/\.md$/, '')))
      let id = base
      for (let i = 2; existants.has(id); i++) id = `${base}-${i}`
      const element: ElementInbox = { id, titre: e.titre.trim() || 'Sans titre', recu: maintenant.slice(0, 16), texte: e.texte, ...(e.source ? { source: e.source } : {}) }
      await this.adaptateur.ecrire(joindre(DOSSIER_INBOX, `${id}.md`), ecrireElement(element))
      return element
    })
  }

  /** Supprime un élément en attente, sans le garder dans l'historique. */
  retirer(element: string): Promise<void> {
    return this.enFile(() => this.supprimerSiPresent(joindre(DOSSIER_INBOX, `${element}.md`)))
  }

  /** Supprime un document rangé ; ceux qu'il remplaçait redeviennent à jour. */
  supprimerDocument(id: string): Promise<void> {
    return this.enFile(async () => {
      await this.supprimerSiPresent(joindre(DOSSIER_DOCUMENTS, `${id}.md`))
      for (const n of await this.lister(DOSSIER_DOCUMENTS)) {
        const chemin = joindre(DOSSIER_DOCUMENTS, n)
        const texte = await this.lireOuNull(chemin)
        if (texte === null) continue
        const d = lireDocument(n.replace(/\.md$/, ''), texte)
        if (d.remplacePar === id) {
          const { remplacePar: _r, ...reste } = d
          await this.adaptateur.ecrire(chemin, ecrireDocument(reste))
        }
      }
    })
  }

  /** Passe un élément dans l'historique sans l'assistant ; `maintenant` : AAAA-MM-JJTHH:MM. */
  marquerTraite(element: string, maintenant: string): Promise<void> {
    return this.enFile(async () => {
      const brut = await this.lireOuNull(joindre(DOSSIER_INBOX, `${element}.md`))
      if (brut !== null) await this.archiver(lireElement(element, brut), { traite: maintenant, bilan: ['Marqué traité'] })
    })
  }

  /** Supprime tout l'historique des éléments traités. */
  viderHistorique(): Promise<void> {
    return this.enFile(async () => {
      for (const n of await this.lister(DOSSIER_TRAITES)) await this.supprimerSiPresent(joindre(DOSSIER_TRAITES, n))
    })
  }

  /** Range un élément dans l'historique, avec ce qui en a été fait, et le retire de l'attente. */
  private async archiver(element: ElementInbox, fait: { traite: string; bilan: string[]; document?: string }): Promise<void> {
    const { question: _question, ...reste } = element
    const traite: ElementTraite = { ...reste, ...fait, ...(fait.document ? { texte: '' } : {}) }
    await this.adaptateur.ecrire(joindre(DOSSIER_TRAITES, `${element.id}.md`), ecrireElementTraite(traite))
    await this.supprimerSiPresent(joindre(DOSSIER_INBOX, `${element.id}.md`))
  }

  /** Applique ce qu'un plan confirmé fait de l'inbox ; `maintenant` : AAAA-MM-JJTHH:MM ; `bilan` : ce que le plan a fait par ailleurs. */
  appliquer(actions: readonly ActionConnaissance[], maintenant: string, bilan: BilanPlan = { commun: [], incoherences: [] }): Promise<void> {
    return this.enFile(async () => {
      for (const a of actions) {
        const chemin = joindre(DOSSIER_INBOX, `${a.element}.md`)
        const brut = await this.lireOuNull(chemin)
        if (brut === null) continue // traité ailleurs entre-temps
        const element = lireElement(a.element, brut)
        if (a.type === 'attente') {
          await this.adaptateur.ecrire(chemin, ecrireElement({ ...element, question: a.question }))
          continue
        }
        const signale = bilan.incoherences.filter((i) => !i.source || i.source === a.element).map((i) => `À vérifier : ${i.constat}`)
        let document: string | undefined
        if (a.garder) {
          const existants = new Set((await this.lister(DOSSIER_DOCUMENTS)).map((n) => n.replace(/\.md$/, '')))
          const base = `${a.date}--${slug(a.titre).slice(0, 60) || 'document'}`
          let id = base
          for (let i = 2; existants.has(id); i++) id = `${base}-${i}`
          const doc: DocumentConnaissance = { id, titre: a.titre, date: a.date, ajoute: maintenant, lignes: a.lignes, texte: element.texte, ...(element.source ? { source: element.source } : {}) }
          await this.adaptateur.ecrire(joindre(DOSSIER_DOCUMENTS, `${id}.md`), ecrireDocument(doc))
          for (const r of a.remplace) {
            const cheminR = joindre(DOSSIER_DOCUMENTS, `${r.id}.md`)
            const texteR = await this.lireOuNull(cheminR)
            if (texteR !== null) await this.adaptateur.ecrire(cheminR, ecrireDocument({ ...lireDocument(r.id, texteR), remplacePar: id }))
          }
          document = id
        }
        const range = a.garder ? [`Rangé dans les documents (« ${a.titre} », du ${a.date.split('-').reverse().join('/')})${a.remplace.length > 0 ? ` ; remplace ${a.remplace.map((r) => `« ${r.titre} »`).join(', ')}` : ''}`] : []
        const lignes = [...bilan.commun, ...signale, ...range]
        await this.archiver(element, { traite: maintenant, bilan: lignes.length > 0 ? lignes : ['Rien à reporter'], ...(document ? { document } : {}) })
      }
    })
  }

  private async lireDossier<T>(dossier: string, lire: (id: string, texte: string) => T): Promise<T[]> {
    const noms = await this.lister(dossier)
    const lus = await Promise.all(noms.map(async (n) => ({ n, t: await this.lireOuNull(joindre(dossier, n)) })))
    return lus.flatMap(({ n, t }) => (t === null ? [] : [lire(n.replace(/\.md$/, ''), t)]))
  }

  private async lister(dossier: string): Promise<string[]> {
    try {
      return (await this.adaptateur.lister(dossier)).filter((e) => e.type === 'fichier' && e.nom.endsWith('.md')).map((e) => e.nom)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return []
      throw e
    }
  }

  private async lireOuNull(chemin: string): Promise<string | null> {
    try {
      return await this.adaptateur.lire(chemin)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return null
      throw e
    }
  }

  private async supprimerSiPresent(chemin: string): Promise<void> {
    try {
      await this.adaptateur.supprimer(chemin)
    } catch (e) {
      if (!(e instanceof FichierIntrouvable)) throw e
    }
  }

  private enFile<T>(action: () => Promise<T>): Promise<T> {
    const suite = this.file.then(action)
    this.file = suite.catch(() => undefined)
    return suite
  }
}

/** Horodatage local AAAA-MM-JJTHH:MM:SS. */
export function horodatage(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`
}

// --- Outils de lecture des documents ---

const PASSAGE = 900
const PASSAGES_RENVOYES = 8
const LONGUEUR_DOCUMENT = 20_000
/** Documents listés dans la description envoyée au modèle, les plus récents. */
export const DOCUMENTS_LISTES = 30

export const OUTILS_DOCUMENTS: DefinitionOutil[] = [
  {
    nom: 'chercher_documents',
    description:
      "Cherche dans les documents de l'utilisateur (présentations, comptes rendus, mails convertis) : renvoie les passages qui contiennent ces mots, avec leur document et sa date. Les documents remplacés par un plus récent sont exclus, sauf `inclure_remplaces`.",
    parametres: {
      type: 'object',
      properties: {
        texte: { type: 'string', description: 'mots cherchés (noms de projets, versions, sujets)' },
        inclure_remplaces: { type: 'boolean' },
      },
      required: ['texte'],
    },
  },
  {
    nom: 'lire_document',
    description: "Lit un document en entier (Markdown), avec sa date et les lignes qu'il concerne.",
    parametres: { type: 'object', properties: { document: { type: 'string', description: 'id du document' } }, required: ['document'] },
  },
]

const NOMS_DOCUMENTS = new Set(OUTILS_DOCUMENTS.map((o) => o.nom))
export const estLectureDocument = (appel: AppelOutil) => NOMS_DOCUMENTS.has(appel.nom)

const plier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Passages d'un document : ses sections, coupées autour de `PASSAGE` caractères. */
function passages(texte: string): string[] {
  const blocs = texte.split(/\n(?=#{1,6}\s)|\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const r: string[] = []
  let courant = ''
  for (const b of blocs) {
    if (courant && courant.length + b.length > PASSAGE) {
      r.push(courant)
      courant = ''
    }
    courant = courant ? `${courant}\n${b}` : b
    while (courant.length > PASSAGE * 2) {
      r.push(courant.slice(0, PASSAGE))
      courant = courant.slice(PASSAGE)
    }
  }
  if (courant) r.push(courant)
  return r
}

function arguments_(appel: AppelOutil): Record<string, unknown> {
  let args: unknown
  try {
    args = JSON.parse(appel.arguments || '{}')
  } catch {
    return erreur('arguments illisibles (JSON attendu)')
  }
  return estObjet(args) ? args : erreur("objet d'arguments attendu")
}

export function trouverDocument(documents: readonly DocumentConnaissance[], ref: unknown): DocumentConnaissance {
  const r = typeof ref === 'string' ? ref.trim().replace(/\.md$/, '') : ''
  const d = documents.find((x) => x.id === r) ?? documents.find((x) => normaliser(x.titre) === normaliser(r))
  return d ?? erreur(`document inconnu : « ${r} » (ids : ${documents.slice(0, 10).map((x) => x.id).join(', ')}${documents.length > 10 ? '…' : ''})`)
}

/** Exécute une lecture de documents ; le texte renvoyé repart au modèle. */
export function lireDocuments(documents: readonly DocumentConnaissance[], appel: AppelOutil): string {
  try {
    const args = arguments_(appel)
    if (appel.nom === 'lire_document') {
      const d = trouverDocument(documents, args.document)
      const entete = [`${d.id} | ${d.titre} | daté du ${d.date}${d.source ? ` | fichier ${d.source}` : ''}`]
      if (d.lignes.length > 0) entete.push(`lignes concernées : ${d.lignes.join(', ')}`)
      if (d.remplacePar) entete.push(`REMPLACÉ par ${d.remplacePar} : ne plus s'y fier pour l'état actuel`)
      const corps = d.texte.length > LONGUEUR_DOCUMENT ? `${d.texte.slice(0, LONGUEUR_DOCUMENT)}\n… (document coupé : ${d.texte.length} caractères)` : d.texte
      return `${entete.join('\n')}\n\n${corps}`
    }
    const cherche = texteRequis(args, 'texte')
    const actifs = args.inclure_remplaces === true ? documents : documents.filter((d) => !d.remplacePar)
    if (actifs.length === 0) return 'Aucun document.'
    const index = new MiniSearch<{ id: number; doc: number; texte: string }>({ fields: ['texte'], storeFields: ['doc', 'texte'], processTerm: (t) => plier(t) })
    let n = 0
    actifs.forEach((d, i) => index.addAll(passages(`${d.titre}\n${d.texte}`).map((texte) => ({ id: n++, doc: i, texte }))))
    const trouves = index.search(cherche, { prefix: true, fuzzy: 0.15, combineWith: 'OR' }).slice(0, PASSAGES_RENVOYES)
    if (trouves.length === 0) return `Aucun passage ne contient « ${cherche} ».`
    return [
      `${trouves.length} passage${trouves.length > 1 ? 's' : ''} (document | date | titre, puis le passage) :`,
      ...trouves.map((t) => {
        const d = actifs[t.doc as number]!
        return `--- ${d.id} | ${d.date} | ${d.titre}${d.remplacePar ? ' (remplacé)' : ''}\n${t.texte as string}`
      }),
    ].join('\n')
  } catch (e) {
    if (e instanceof ErreurProposition) return `Erreur : ${e.message}.`
    throw e
  }
}

// --- Outils de l'inbox ---

export const OUTILS_INBOX: DefinitionOutil[] = [
  {
    nom: 'classer_element',
    description:
      "Termine le traitement d'un élément de l'inbox, une fois ses mises à jour proposées. `garder` : true pour un document à consulter plus tard (présentation, compte rendu, mail), false pour une simple remarque déjà reportée dans les pages.",
    parametres: {
      type: 'object',
      properties: {
        element: { type: 'string', description: "id de l'élément" },
        garder: { type: 'boolean' },
        titre: { type: 'string', description: 'titre court du document (par défaut : celui de l’élément)' },
        date: { type: 'string', description: "date de l'information, AAAA-MM-JJ (celle de la présentation ou de la réunion ; par défaut : sa réception)" },
        lignes: { type: 'array', items: { type: 'string' }, description: 'lignes concernées, « base/id »' },
        remplace: { type: 'array', items: { type: 'string' }, description: 'ids des documents que celui-ci remplace (la version précédente du même point)' },
      },
      required: ['element', 'garder'],
    },
  },
  {
    nom: 'laisser_en_attente',
    description: "Laisse un élément dans l'inbox, avec la question à poser à l'utilisateur, quand tu ne sais pas à quoi le rattacher.",
    parametres: { type: 'object', properties: { element: { type: 'string' }, question: { type: 'string' } }, required: ['element', 'question'] },
  },
  {
    nom: 'signaler_incoherence',
    description:
      "Signale à l'utilisateur un écart que tu ne sais pas trancher : une information qui en contredit une autre (présentation contre statut Jira, date qui change sans explication par rapport au document précédent, contradiction avec le contexte). Rien n'est modifié.",
    parametres: {
      type: 'object',
      properties: { constat: { type: 'string', description: 'les deux informations, leur source et leur date, en une ou deux phrases' }, source: { type: 'string', description: "id de l'élément ou du document" } },
      required: ['constat'],
    },
  },
]

const NOMS_INBOX = new Set(OUTILS_INBOX.map((o) => o.nom))
export const estOutilInbox = (nom: string) => NOMS_INBOX.has(nom)

export type ValideInbox = { type: 'connaissance'; action: ActionConnaissance } | { type: 'incoherence'; incoherence: Incoherence }

/**
 * Valide un appel d'outil de l'inbox. `lignes` dit si une référence `base/id`
 * désigne une ligne existante ; `aujourdhui` date un document sans date.
 */
export function validerInbox(
  appel: { nom: string; args: Record<string, unknown> },
  c: { inbox: readonly ElementInbox[]; documents: readonly DocumentConnaissance[]; ligneExiste: (base: string, id: string) => boolean; aujourdhui: string },
): ValideInbox {
  const { args } = appel
  if (appel.nom === 'signaler_incoherence') {
    const source = texteOuRien(args.source)
    return { type: 'incoherence', incoherence: { constat: texteRequis(args, 'constat'), ...(source ? { source } : {}) } }
  }
  const ref = texteRequis(args, 'element')
  const element = c.inbox.find((e) => e.id === ref) ?? erreur(`élément d'inbox inconnu : « ${ref} » (ids : ${c.inbox.map((e) => e.id).join(', ')})`)
  if (appel.nom === 'laisser_en_attente') return { type: 'connaissance', action: { type: 'attente', element: element.id, titreElement: element.titre, question: texteRequis(args, 'question') } }
  const date = texteOuRien(args.date)
  if (date !== undefined && !DATE.test(date)) erreur(`date AAAA-MM-JJ attendue, reçu « ${date} »`)
  const lignes = (Array.isArray(args.lignes) ? args.lignes : []).map((l) => {
    const m = typeof l === 'string' ? /^([^/\s]+)\/([^/\s]+)$/.exec(l.trim()) : null
    if (!m || !c.ligneExiste(m[1]!, m[2]!)) erreur(`ligne inconnue : ${JSON.stringify(l)} (attendu « base/id » d'une ligne existante)`)
    return `${m![1]}/${m![2]}`
  })
  const remplace = (Array.isArray(args.remplace) ? args.remplace : []).map((r) => {
    const d = trouverDocument(c.documents, r)
    return { id: d.id, titre: d.titre }
  })
  return {
    type: 'connaissance',
    action: {
      type: 'classer',
      element: element.id,
      titreElement: element.titre,
      garder: args.garder !== false,
      titre: texteOuRien(args.titre) ?? element.titre,
      date: date ?? (lireJour(element.recu) || c.aujourdhui),
      lignes,
      remplace,
    },
  }
}

export function decrireConnaissance(a: ActionConnaissance): string {
  if (a.type === 'attente') return `Laisser « ${a.titreElement} » dans l'inbox : ${a.question}`
  const remplace = a.remplace.length > 0 ? ` ; remplace ${a.remplace.map((r) => `« ${r.titre} »`).join(', ')}` : ''
  return a.garder ? `Ranger « ${a.titreElement} » dans les documents (« ${a.titre} », du ${a.date})${remplace}` : `Classer « ${a.titreElement} » dans les traités (reporté dans les pages)`
}

/** Longueur d'un élément envoyé tel quel au traitement ; au-delà, le modèle le lit en entier sur demande… s'il est rangé. */
const LONGUEUR_ELEMENT = 40_000

/** Les éléments à traiter, tels que le modèle les lit dans la demande. */
export function decrireInbox(inbox: readonly ElementInbox[]): string {
  return inbox
    .map((e) => {
      const texte = e.texte.length > LONGUEUR_ELEMENT ? `${e.texte.slice(0, LONGUEUR_ELEMENT)}\n… (coupé : ${e.texte.length} caractères)` : e.texte
      const infos = [`reçu le ${e.recu.replace('T', ' à ')}`, e.source && `fichier ${e.source}`, e.question && `question déjà posée : ${e.question}`].filter(Boolean).join(', ')
      return `### Élément ${e.id} : ${e.titre} (${infos})\n${texte}`
    })
    .join('\n\n')
}

export const CONSIGNE_INBOX = `Traite chaque élément de l'inbox ci-dessous :
1. Identifie les lignes qu'il concerne (projets, versions, lots, tickets…), en suivant l'organisation décrite dans le contexte. Lis-les avant d'agir (\`chercher_lignes\`, \`chercher_texte\`, \`lire_page\`).
2. Propose tout ce qui en découle : champs à mettre à jour (\`modifier_lignes\`), remarques datées dans les pages (\`ajouter_remarque\`, dans la section prévue par le contexte), et les conséquences sur les lignes liées selon les règles du contexte. Une information plus récente que la base la met à jour.
3. Compare avec l'existant : les bases, le statut des tickets Jira liés, le document précédent sur le même sujet (\`chercher_documents\`). Ce qui se contredit sans que tu saches quelle source est juste : \`signaler_incoherence\`, sans le corriger.
4. Termine chaque élément par \`classer_element\` (avec \`remplace\` s'il remplace la version précédente d'un document), ou \`laisser_en_attente\` avec ta question si tu ne sais pas le rattacher.`
