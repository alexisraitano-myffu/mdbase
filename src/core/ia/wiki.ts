import type { DepotEspace, EtatEspace } from '../depot-espace'
import { ecrireLien } from '../liens-internes'
import { estObjet } from '../schema'
import { arbreWiki, comparerPages, descendants, ordreEnFin, ordreEntre, type NoeudWiki, type PageWiki } from '../wiki'
import type { AppelOutil, DefinitionOutil } from './modele'
import { erreur, ErreurProposition, normaliser, texteRequis } from './references'

// Outils du wiki (spec §22) : les mêmes pour l'assistant et pour le MCP, présents
// seulement quand le module Wiki est actif. Lectures : le résultat repart au
// modèle. Écritures : des actions « suite » du plan, validées ici contre les
// pages, montrées dans l'aperçu de l'assistant et appliquées aussitôt par le MCP.

const LONGUEUR_PAGE = 12_000
const PAGES_TROUVEES_MAX = 50

const PAGE = { type: 'string', description: 'id de la page (lu avec lister_wiki), ou son titre exact' }

export const OUTILS_WIKI_LECTURE: DefinitionOutil[] = [
  {
    nom: 'lister_wiki',
    description: "Liste les pages du wiki de l'espace en arbre (sous-pages en retrait), avec leur id et la taille de leur contenu.",
    parametres: { type: 'object', properties: {} },
  },
  {
    nom: 'lire_wiki',
    description: "Lit une page du wiki : son contenu Markdown, son parent, ses sous-pages, et le lien qui la cite depuis une autre page ou une ligne.",
    parametres: { type: 'object', properties: { page: PAGE }, required: ['page'] },
  },
  {
    nom: 'chercher_wiki',
    description: 'Cherche un mot ou une expression dans les titres et le contenu des pages du wiki, sans casse ni accents. Renvoie les pages trouvées avec un extrait.',
    parametres: { type: 'object', properties: { texte: { type: 'string', description: 'mot ou expression cherchée' } }, required: ['texte'] },
  },
]

export const OUTILS_WIKI: DefinitionOutil[] = [
  {
    nom: 'ecrire_wiki',
    description:
      "Crée une page du wiki (sans `page`) ou modifie une page existante (`page`). Le contenu est du Markdown ; pour citer une autre page, son lien tel que lire_wiki le donne. Une page créée par un appel précédent se désigne par son titre (comme parent ou comme page).",
    parametres: {
      type: 'object',
      properties: {
        page: { ...PAGE, description: 'page à modifier (id ou titre exact) ; absent : une page est créée' },
        titre: { type: 'string', description: 'titre de la page créée, ou nouveau titre de la page modifiée' },
        parent: { type: 'string', description: 'à la création : id ou titre de la page parente (absent : à la racine)' },
        contenu: { type: 'string', description: 'contenu Markdown de la page' },
        mode: { type: 'string', enum: ['remplacer', 'ajouter'], description: 'remplacer le contenu (par défaut) ou l’ajouter à la fin' },
      },
    },
  },
  {
    nom: 'deplacer_wiki',
    description: "Range une page du wiki sous une autre page, ou à la racine ; ses sous-pages la suivent. Jamais sous elle-même ni sous ses sous-pages.",
    parametres: {
      type: 'object',
      properties: {
        page: PAGE,
        parent: { type: ['string', 'null'], description: 'id ou titre de la nouvelle page parente ; null : à la racine' },
        rang: { type: 'number', description: 'position parmi ses nouvelles sœurs, à partir de 1 (par défaut : en dernier)' },
      },
      required: ['page', 'parent'],
    },
  },
]

const LECTURES = new Set(OUTILS_WIKI_LECTURE.map((o) => o.nom))
const ECRITURES = new Set(OUTILS_WIKI.map((o) => o.nom))
export const estLectureWiki = (nom: string) => LECTURES.has(nom)
export const estOutilWiki = (nom: string) => LECTURES.has(nom) || ECRITURES.has(nom)

/** Une page désignée : existante (id), ou créée plus tôt par le même plan (titre). */
export type RefPage = { id: string } | { cree: string }

export type ActionWiki =
  /** `page: null` : la page est créée. `renommer` : nouveau titre d'une page existante. `contenu: null` : corps inchangé. */
  | { type: 'ecrire_wiki'; page: RefPage | null; titre: string; renommer?: string; parent: RefPage | null; nomParent: string | null; contenu: string | null; mode: 'remplacer' | 'ajouter' }
  /** `rang` : position parmi les sœurs, à partir de 1 ; absent, en dernier. */
  | { type: 'deplacer_wiki'; page: RefPage; titre: string; parent: RefPage | null; nomParent: string | null; rang?: number }

// ── Lecture ─────────────────────────────────────────────────────────

const plier = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const titreDe = (p: PageWiki) => p.titre || 'Sans titre'

/** Page désignée par son id, son lien (`_wiki/slug--id`) ou son titre exact ; une erreur sinon. */
export function trouverPage(pages: readonly PageWiki[], ref: unknown): PageWiki {
  if (typeof ref !== 'string' || ref.trim() === '') return erreur('`page` : id ou titre attendu')
  const brut = ref.trim()
  const id = brut.includes('--') ? brut.slice(brut.lastIndexOf('--') + 2).replace(/\.md$/, '').replace(/[|\]].*$/, '') : brut
  const parId = pages.find((p) => p.id === id)
  if (parId) return parId
  const parTitre = pages.filter((p) => normaliser(p.titre) === normaliser(brut))
  if (parTitre.length === 1) return parTitre[0]!
  if (parTitre.length > 1) return erreur(`plusieurs pages s'appellent « ${brut} » : désigne-la par son id (${parTitre.map((p) => p.id).join(', ')})`)
  return erreur(`page du wiki introuvable : « ${brut} » (lister_wiki donne les ids)`)
}

function lister(pages: readonly PageWiki[]): string {
  if (pages.length === 0) return 'Le wiki est vide : aucune page.'
  const lignes: string[] = []
  const parcourir = (noeuds: NoeudWiki[], niveau: number) => {
    for (const n of noeuds) {
      const taille = n.page.corps.trim().length
      lignes.push(`${'  '.repeat(niveau)}- ${titreDe(n.page)} (id ${n.page.id}${taille > 0 ? `, ${taille} caractères` : ', vide'}${n.signale ? `, ${n.signale}` : ''})`)
      parcourir(n.enfants, niveau + 1)
    }
  }
  parcourir(arbreWiki(pages), 0)
  return [`${pages.length} page${pages.length > 1 ? 's' : ''} :`, ...lignes].join('\n')
}

function lirePage(pages: readonly PageWiki[], args: Record<string, unknown>): string {
  const p = trouverPage(pages, args.page)
  const parent = p.parent === null ? null : pages.find((x) => x.id === p.parent)
  const enfants = pages.filter((x) => x.parent === p.id).sort(comparerPages)
  const corps = p.corps.trim()
  return [
    `# ${titreDe(p)}`,
    `id : ${p.id}`,
    `parent : ${parent ? `${titreDe(parent)} (id ${parent.id})` : 'aucun (racine)'}`,
    ...(enfants.length > 0 ? [`sous-pages : ${enfants.map((e) => `${titreDe(e)} (id ${e.id})`).join(', ')}`] : []),
    `lien pour la citer : ${ecrireLien(p.chemin, p.titre)}`,
    '',
    corps === '' ? '(page vide)' : corps.length > LONGUEUR_PAGE ? `${corps.slice(0, LONGUEUR_PAGE)}\n… (page coupée : ${corps.length} caractères)` : corps,
  ].join('\n')
}

function chercher(pages: readonly PageWiki[], args: Record<string, unknown>): string {
  const brut = texteRequis(args, 'texte')
  const cherche = plier(brut)
  const trouvees: string[] = []
  for (const p of [...pages].sort(comparerPages)) {
    let ou: string | null = null
    if (plier(p.titre).includes(cherche)) ou = 'titre'
    else {
      const i = plier(p.corps).indexOf(cherche)
      if (i >= 0) {
        const debut = Math.max(0, i - 60)
        const fin = Math.min(p.corps.length, i + cherche.length + 60)
        ou = `${debut > 0 ? '…' : ''}${p.corps.slice(debut, fin).replace(/\s+/g, ' ').trim()}${fin < p.corps.length ? '…' : ''}`
      }
    }
    if (ou !== null) trouvees.push(`${p.id} | ${titreDe(p)} | ${ou}`)
  }
  if (trouvees.length === 0) return `Aucune page du wiki ne contient « ${brut} ».`
  const coupe = trouvees.length > PAGES_TROUVEES_MAX ? ` (les ${PAGES_TROUVEES_MAX} premières)` : ''
  return [`${trouvees.length} page${trouvees.length > 1 ? 's contiennent' : ' contient'} « ${brut} »${coupe} (id | titre | où) :`, ...trouvees.slice(0, PAGES_TROUVEES_MAX)].join('\n')
}

/** Exécute une lecture du wiki ; le texte (ou l'erreur) repart au modèle. */
export function lireWiki(etat: EtatEspace, appel: AppelOutil): string {
  try {
    let args: unknown
    try {
      args = JSON.parse(appel.arguments || '{}')
    } catch {
      return 'Erreur : arguments illisibles (JSON attendu)'
    }
    if (!estObjet(args)) return "Erreur : objet d'arguments attendu"
    const pages = etat.wiki.pages
    if (appel.nom === 'lister_wiki') return lister(pages)
    if (appel.nom === 'lire_wiki') return lirePage(pages, args)
    if (appel.nom === 'chercher_wiki') return chercher(pages, args)
    return `Erreur : outil inconnu : ${appel.nom}`
  } catch (e) {
    if (e instanceof ErreurProposition) return `Erreur : ${e.message}`
    throw e
  }
}

// ── Écriture ────────────────────────────────────────────────────────

/** Ce que la validation sait des pages : celles du disque, et les titres des pages que le plan crée. */
export type BrouillonWiki = { pages: readonly PageWiki[]; creees: string[] }

/** Page existante, ou créée plus tôt dans le plan (par son titre). */
function refPage(w: BrouillonWiki, ref: unknown, cle: string): { ref: RefPage; titre: string; page?: PageWiki } {
  if (typeof ref !== 'string' || ref.trim() === '') return erreur(`\`${cle}\` : id ou titre de page attendu`)
  const cree = [...w.creees].reverse().find((t) => normaliser(t) === normaliser(ref))
  if (cree !== undefined) return { ref: { cree }, titre: cree }
  const page = trouverPage(w.pages, ref)
  return { ref: { id: page.id }, titre: titreDe(page), page }
}

export function validerWiki(w: BrouillonWiki, nom: string, args: Record<string, unknown>): ActionWiki {
  const mode = args.mode === 'ajouter' ? 'ajouter' : 'remplacer'
  const contenu = typeof args.contenu === 'string' ? args.contenu : null
  const titre = typeof args.titre === 'string' && args.titre.trim() !== '' ? args.titre.trim() : undefined
  if (nom === 'ecrire_wiki') {
    if (args.page === undefined || args.page === null || args.page === '') {
      if (!titre) return erreur('`titre` : le titre de la page à créer est attendu')
      const parent = args.parent === undefined || args.parent === null || args.parent === '' ? null : refPage(w, args.parent, 'parent')
      w.creees.push(titre)
      return { type: 'ecrire_wiki', page: null, titre, parent: parent?.ref ?? null, nomParent: parent?.titre ?? null, contenu, mode }
    }
    const page = refPage(w, args.page, 'page')
    if (contenu === null && !titre) return erreur('rien à écrire : donner `contenu` ou un nouveau `titre`')
    if (args.parent !== undefined && args.parent !== null) return erreur('`parent` ne vaut qu’à la création : pour ranger une page existante, deplacer_wiki')
    const renommer = titre && titre !== page.titre ? titre : undefined
    if (renommer && 'cree' in page.ref) return erreur('une page créée par le même plan se titre à sa création')
    return { type: 'ecrire_wiki', page: page.ref, titre: page.titre, ...(renommer && { renommer }), parent: null, nomParent: null, contenu, mode }
  }
  if (nom === 'deplacer_wiki') {
    const page = refPage(w, args.page, 'page')
    if (!('id' in page.ref)) return erreur('une page créée par le même plan se range à sa création, avec `parent`')
    const parent = args.parent === null || args.parent === '' ? null : refPage(w, args.parent, 'parent')
    if (parent && 'id' in parent.ref && (parent.ref.id === page.ref.id || descendants(w.pages, page.ref.id).includes(parent.ref.id)))
      return erreur(`« ${page.titre} » ne peut pas aller sous elle-même ni sous ses sous-pages`)
    const rang = typeof args.rang === 'number' && Number.isInteger(args.rang) && args.rang >= 1 ? args.rang : undefined
    return { type: 'deplacer_wiki', page: page.ref, titre: page.titre, parent: parent?.ref ?? null, nomParent: parent?.titre ?? null, ...(rang !== undefined && { rang }) }
  }
  return erreur(`outil inconnu : ${nom}`)
}

const court = (t: string) => (t.length > 80 ? `${t.slice(0, 80)}…` : t)

export function decrireActionWiki(a: ActionWiki): string {
  const sous = a.nomParent === null ? 'à la racine du wiki' : `sous « ${a.nomParent} »`
  if (a.type === 'deplacer_wiki') return `Ranger la page « ${a.titre} » ${sous}${a.rang !== undefined ? `, en position ${a.rang}` : ''}`
  if (a.page === null) return `Créer la page « ${a.titre} » ${sous}${a.contenu ? ` : ${court(a.contenu)}` : ''}`
  const parties = [...(a.renommer ? [`renommer en « ${a.renommer} »`] : []), ...(a.contenu !== null ? [`${a.mode === 'ajouter' ? 'compléter' : 'écrire'} le contenu : ${court(a.contenu)}`] : [])]
  return `Page « ${a.titre} » du wiki : ${parties.join(' ; ')}`
}

/** Pages créées par le plan, titre → id, pour les appels qui les visent ensuite. */
export type CreeesWiki = Map<string, string>

const idDe = (ref: RefPage, creees: CreeesWiki): string | undefined => ('id' in ref ? ref.id : creees.get(normaliser(ref.cree)))

export async function appliquerWiki(espace: DepotEspace, a: ActionWiki, creees: CreeesWiki): Promise<void> {
  const pages = () => espace.etat().wiki.pages
  if (a.type === 'ecrire_wiki') {
    if (a.page === null) {
      const parent = a.parent === null ? null : (idDe(a.parent, creees) ?? null)
      const page = await espace.creerPageWiki({ titre: a.titre, parent, ...(a.contenu && { corps: `${a.contenu.trim()}\n` }) })
      creees.set(normaliser(a.titre), page.id)
      return
    }
    const id = idDe(a.page, creees)
    const page = pages().find((p) => p.id === id)
    if (!page) return
    if (a.contenu !== null) {
      const corps = a.mode === 'ajouter' && page.corps.trim() !== '' ? `${page.corps.trimEnd()}\n\n${a.contenu.trim()}\n` : `${a.contenu.trim()}\n`
      espace.modifierCorpsPageWiki(page.id, corps)
    }
    if (a.renommer) await espace.renommerPageWiki(page.id, a.renommer)
    return
  }
  const id = idDe(a.page, creees)
  if (!id || !pages().some((p) => p.id === id)) return
  const parent = a.parent === null ? null : (idDe(a.parent, creees) ?? null)
  const soeurs = pages().filter((p) => p.parent === parent && p.id !== id).sort(comparerPages)
  const ordre = a.rang === undefined || a.rang > soeurs.length ? ordreEnFin(soeurs, parent) : ordreEntre(soeurs[a.rang - 2]?.ordre, soeurs[a.rang - 1]?.ordre)
  espace.deplacerPageWiki(id, parent, ordre)
}
