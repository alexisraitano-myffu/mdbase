import type { DepotEspace } from '../core/depot-espace'
import { avecSkill, proposer, type Echange } from '../core/ia/assistant'
import { DemandeArretee, type Progression } from '../core/ia/modele'
import { appliquerPlan, resumerPlan, type ActionMemoire, type Plan } from '../core/ia/plan'
import { modeleCompatibleOpenAI } from '../adapters/ia/compatible-openai'
import { enregistrerConversations, lireConversations, type ConversationGardee, type ReglagesIA, type TourGarde } from '../adapters/ia/reglages'
import { aujourdhui } from '../adapters/navigateur'

// Conversation avec l'assistant IA (spec §12, « Module IA »), hors de tout
// composant : fermer ou replier le panneau ne coupe pas une demande en cours.
// Seul l'utilisateur l'arrête (bouton Arrêter), ou le service s'il se tait.

export type Resultat =
  | { type: 'envoi'; depuis: number; progression?: Progression }
  | { type: 'reponse'; texte: string; duree?: number }
  | {
      type: 'plan'
      /** `null` pour un plan relu d'une session précédente : il n'est plus proposé à l'application. */
      plan: Plan | null
      resume: string
      message: string
      statut: 'attente' | 'application' | 'applique' | 'annule'
      duree?: number
    }
  | { type: 'erreur'; message: string }
  /** Arrêtée par l'utilisateur ; `texte` est ce qui était déjà arrivé. */
  | { type: 'arrete'; texte: string }

/** Fait retenu ou oublié pendant un tour : écrit aussitôt, annulable dans la session ; `garde` = relu d'une session précédente. */
export type MentionMemoire = { action: ActionMemoire; etat: 'fait' | 'annule' | 'garde' }

/** Ce que l'utilisateur envoie : son texte, les bases citées avec `@` (ids) et le skill choisi avec `/`. */
export type Demande = { texte: string; bases: string[]; skill?: string }

export type Tour = { demande: string; bases?: string[]; skill?: string; resultat: Resultat; memoire?: MentionMemoire[] }

export const texteMention = (a: ActionMemoire) => `${a.type === 'retenir' ? 'Retenu' : 'Oublié'} : ${a.fait}`
const mentionsFaites = (t: Tour) => (t.memoire ?? []).filter((m) => m.etat !== 'annule').map((m) => texteMention(m.action))

/** Ce que le modèle relit d'un tour passé, mentions de mémoire comprises. */
function echange(t: Tour): Echange | null {
  const e = echangeSansMemoire({ ...t, demande: avecSkill(t.demande, t.skill) })
  const mentions = mentionsFaites(t)
  return e && mentions.length > 0 ? { ...e, reponse: [e.reponse, ...mentions].filter(Boolean).join('\n') } : e
}

function echangeSansMemoire(t: Tour): Echange | null {
  const r = t.resultat
  switch (r.type) {
    case 'envoi':
      return null
    case 'reponse':
      return { demande: t.demande, reponse: r.texte }
    case 'erreur':
      return { demande: t.demande, reponse: `Erreur : ${r.message}` }
    case 'arrete':
      return { demande: t.demande, reponse: `${r.texte ? `${r.texte}\n` : ''}(Arrêté par l’utilisateur avant la fin de la réponse.)` }
    case 'plan': {
      const suite = r.statut === 'applique' ? 'Appliqué.' : r.statut === 'annule' ? 'Annulé par l’utilisateur.' : 'Pas appliqué.'
      return { demande: t.demande, reponse: `${r.message ? `${r.message}\n` : ''}Proposé :\n${r.resume}\n${suite}` }
    }
  }
}

function versGarde(t: Tour): TourGarde | null {
  const r = t.resultat
  if (r.type === 'envoi') return null
  const mentions = mentionsFaites(t)
  const memoire = { ...(mentions.length > 0 ? { memoire: mentions } : {}), ...citations(t) }
  if (r.type === 'reponse') return { demande: t.demande, type: 'reponse', texte: r.texte, ...memoire }
  if (r.type === 'erreur') return { demande: t.demande, type: 'erreur', texte: r.message, ...citations(t) }
  if (r.type === 'arrete') return { demande: t.demande, type: 'arrete', texte: r.texte, ...citations(t) }
  return { demande: t.demande, type: 'plan', texte: r.resume, statut: r.statut === 'applique' ? 'applique' : 'annule', ...memoire }
}

/** Bases citées et skill d'un tour, seulement s'il y en a. */
const citations = (t: { bases?: string[]; skill?: string }) => ({ ...(t.bases?.length ? { bases: t.bases } : {}), ...(t.skill ? { skill: t.skill } : {}) })

function depuisGarde(g: TourGarde): Tour {
  return { ...depuisGardeSeul(g), ...citations(g) }
}

function depuisGardeSeul(g: TourGarde): Tour {
  // Une mention relue n'est plus annulable : elle n'est gardée que comme texte.
  const memoire = (g.memoire ?? []).map((texte): MentionMemoire => {
    const [type, ...reste] = texte.split(' : ')
    return { action: { type: type === 'Oublié' ? 'oublier' : 'retenir', fait: reste.join(' : ') }, etat: 'garde' }
  })
  if (g.type === 'reponse') return { demande: g.demande, resultat: { type: 'reponse', texte: g.texte }, memoire }
  if (g.type === 'erreur') return { demande: g.demande, resultat: { type: 'erreur', message: g.texte } }
  if (g.type === 'arrete') return { demande: g.demande, resultat: { type: 'arrete', texte: g.texte } }
  return { demande: g.demande, resultat: { type: 'plan', plan: null, resume: g.texte, message: '', statut: g.statut ?? 'annule' }, memoire }
}

/** Ce que montre le bouton de la barre latérale quand le panneau est fermé. */
export type ActiviteIA = 'en-cours' | 'a-voir' | null

/** Une conversation de l'historique : son titre est sa première demande. */
export type EntreeHistorique = { id: string; titre: string; maj: number; courante: boolean }

const nouvelId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const titreDe = (tours: readonly { demande: string; skill?: string }[]) => {
  const premier = tours.find((t) => t.demande || t.skill)
  return premier ? premier.demande || `/${premier.skill}` : 'Conversation vide'
}

/**
 * Conversations d'un dossier : chaque demande relit les derniers échanges de
 * la sienne, si bien qu'on peut répondre à une question du modèle. Gardées dans
 * le navigateur (historique) ; un plan n'est applicable que dans la session qui l'a reçu.
 */
export class SessionAssistant {
  private tours: Tour[]
  private id: string
  private maj: number
  /** Les autres conversations, telles qu'elles sont gardées. */
  private autres: ConversationGardee[]
  private arret: AbortController | null = null
  private abonnes = new Set<() => void>()
  /** Demande en cours de saisie : retrouvée quand on rouvre le panneau. */
  brouillon: Demande = { texte: '', bases: [] }

  constructor(
    private readonly espace: DepotEspace,
    private readonly dossier: string,
  ) {
    const [derniere, ...autres] = lireConversations(dossier)
    this.id = derniere?.id ?? nouvelId()
    this.maj = derniere?.maj ?? Date.now()
    this.tours = (derniere?.tours ?? []).map(depuisGarde)
    this.autres = autres
  }

  abonner = (f: () => void) => {
    this.abonnes.add(f)
    return () => void this.abonnes.delete(f)
  }
  lire = () => this.tours
  enCours = () => this.tours.some((t) => t.resultat.type === 'envoi')

  activite(): ActiviteIA {
    if (this.enCours()) return 'en-cours'
    return this.tours.some((t) => t.resultat.type === 'plan' && t.resultat.statut === 'attente' && t.resultat.plan) ? 'a-voir' : null
  }

  /** Historique, la plus récente d'abord ; la conversation courante n'y est que si elle a commencé. */
  historique(): EntreeHistorique[] {
    const courante = this.tours.length > 0 ? [{ id: this.id, titre: titreDe(this.tours), maj: this.maj, courante: true }] : []
    const autres = this.autres.map((c) => ({ id: c.id, titre: titreDe(c.tours), maj: c.maj, courante: false }))
    return [...courante, ...autres].sort((a, b) => b.maj - a.maj)
  }

  private garder() {
    const courante: ConversationGardee = { id: this.id, maj: this.maj, tours: this.tours.flatMap((t) => versGarde(t) ?? []) }
    enregistrerConversations(this.dossier, [courante, ...this.autres])
  }

  private prevenir() {
    this.abonnes.forEach((f) => f())
  }

  /** `garder` : faux pour un simple progrès de la réponse, qui ne vaut pas une écriture dans le navigateur. */
  private changer(tours: Tour[], garder = true) {
    this.tours = tours
    if (garder) {
      this.maj = Date.now()
      this.garder()
    }
    this.prevenir()
  }

  private remplacer(i: number, resultat: Resultat, garder = true) {
    this.changer(
      this.tours.map((t, j) => (j === i ? { ...t, resultat } : t)),
      garder,
    )
  }

  async envoyer(d: Demande, o: { reglages: ReglagesIA; baseOuverte: string | null }) {
    const texte = d.texte.trim()
    if ((texte === '' && !d.skill) || this.enCours()) return
    // Une proposition restée sans réponse est abandonnée par la nouvelle demande.
    const passes = this.tours.map((t): Tour => (t.resultat.type === 'plan' && t.resultat.statut === 'attente' ? { ...t, resultat: { ...t.resultat, statut: 'annule' } } : t))
    const i = passes.length
    const depuis = performance.now()
    const arret = new AbortController()
    this.arret = arret
    const id = this.id
    this.changer([...passes, { demande: texte, ...citations(d), resultat: { type: 'envoi', depuis } }])
    let recu: Progression | undefined
    try {
      const r = await proposer(modeleCompatibleOpenAI(o.reglages), this.espace, texte, {
        aujourdhui: aujourdhui(),
        baseOuverte: o.baseOuverte,
        basesCitees: d.bases,
        skill: d.skill,
        historique: passes.flatMap((t) => echange(t) ?? []),
        signal: arret.signal,
        progression: (p) => {
          recu = p
          this.remplacer(i, { type: 'envoi', depuis, progression: p }, false)
        },
      })
      const duree = performance.now() - depuis
      // Mémoire : écrite aussitôt, sans confirmation, avec une mention annulable (spec §12).
      for (const a of r.memoire) await (a.type === 'retenir' ? this.espace.assistant.retenir(a.fait) : this.espace.assistant.oublier(a.fait))
      if (this.id !== id) return // impossible en principe : on ne change pas de conversation pendant une demande
      const memoire = r.memoire.map((action): MentionMemoire => ({ action, etat: 'fait' }))
      this.changer(
        this.tours.map((t, j): Tour =>
          j !== i
            ? t
            : {
                ...t,
                memoire,
                resultat:
                  r.type === 'plan'
                    ? { type: 'plan', plan: r.plan, resume: resumerPlan(r.plan), message: r.message, statut: 'attente', duree }
                    : { type: 'reponse', texte: r.texte, duree },
              },
        ),
      )
    } catch (e) {
      if (this.id !== id) return
      if (e instanceof DemandeArretee) this.remplacer(i, { type: 'arrete', texte: recu?.texte.trim() ?? '' })
      else this.remplacer(i, { type: 'erreur', message: e instanceof Error ? e.message : String(e) })
    } finally {
      if (this.arret === arret) this.arret = null
    }
  }

  /** Coupe la demande en cours pour de bon : la requête au service est interrompue. */
  arreter() {
    this.arret?.abort()
  }

  /**
   * Le dernier tour peut être relancé ou repris pour modification, sauf si son
   * plan a été appliqué : le refaire proposerait deux fois la même écriture.
   */
  dernierModifiable(): boolean {
    const t = this.tours.at(-1)
    if (!t || this.enCours() || (!t.demande && !t.skill)) return false
    return !(t.resultat.type === 'plan' && (t.resultat.statut === 'applique' || t.resultat.statut === 'application'))
  }

  /** Retire le dernier tour et rend sa demande, pour la corriger avant de la renvoyer. */
  reprendreDernier(): Demande | null {
    if (!this.dernierModifiable()) return null
    const t = this.tours.at(-1)!
    this.changer(this.tours.slice(0, -1))
    return { texte: t.demande, bases: t.bases ?? [], ...(t.skill ? { skill: t.skill } : {}) }
  }

  /** Renvoie la dernière demande telle quelle, à la place de sa réponse. */
  relancer(o: { reglages: ReglagesIA; baseOuverte: string | null }) {
    const d = this.reprendreDernier()
    if (d) void this.envoyer(d, o)
  }

  annulerPlan(i: number) {
    const r = this.tours[i]?.resultat
    if (r?.type === 'plan') this.remplacer(i, { ...r, statut: 'annule' })
  }

  async appliquer(i: number) {
    const r = this.tours[i]?.resultat
    if (r?.type !== 'plan' || !r.plan || r.statut !== 'attente') return
    const plan = r.plan
    this.remplacer(i, { ...r, statut: 'application' })
    try {
      // Un seul Ctrl+Z défait tout ce que l'assistant a écrit.
      await this.espace.enUneEtape(() => appliquerPlan(this.espace, plan))
      this.remplacer(i, { ...r, statut: 'applique' })
    } catch (e) {
      this.remplacer(i, { ...r, statut: 'annule' })
      this.changer([...this.tours, { demande: '', resultat: { type: 'erreur', message: e instanceof Error ? e.message : String(e) } }])
    }
  }

  /** Annule un fait retenu ou oublié : l'action inverse est écrite. */
  async annulerMemoire(i: number, k: number) {
    const m = this.tours[i]?.memoire?.[k]
    if (!m || m.etat !== 'fait') return
    await (m.action.type === 'retenir' ? this.espace.assistant.oublier(m.action.fait) : this.espace.assistant.retenir(m.action.fait))
    this.changer(this.tours.map((t, j) => (j === i ? { ...t, memoire: t.memoire?.map((x, l) => (l === k ? { ...x, etat: 'annule' as const } : x)) } : t)))
  }

  /** Range la conversation courante dans l'historique et en commence une vide. */
  nouvelle() {
    if (this.enCours() || this.tours.length === 0) return
    this.basculer({ id: nouvelId(), maj: Date.now(), tours: [] })
  }

  /** Reprend une conversation de l'historique ; ses plans ne sont plus applicables. */
  ouvrir(id: string) {
    const c = this.autres.find((x) => x.id === id)
    if (!c || this.enCours()) return
    // Datée de sa réouverture : c'est elle qui revient au prochain chargement.
    this.basculer({ ...c, maj: Date.now() })
  }

  supprimer(id: string) {
    if (id === this.id) {
      if (this.enCours()) return
      this.tours = []
      this.id = nouvelId()
    }
    this.autres = this.autres.filter((c) => c.id !== id)
    this.garder()
    this.prevenir()
  }

  private basculer(c: ConversationGardee) {
    const courante: ConversationGardee = { id: this.id, maj: this.maj, tours: this.tours.flatMap((t) => versGarde(t) ?? []) }
    this.autres = [...(courante.tours.length > 0 ? [courante] : []), ...this.autres.filter((x) => x.id !== c.id)]
    this.id = c.id
    this.maj = c.maj
    this.tours = c.tours.map(depuisGarde)
    this.garder()
    this.prevenir()
  }
}
