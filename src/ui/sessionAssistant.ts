import type { DepotEspace } from '../core/depot-espace'
import { proposer, type Echange } from '../core/ia/assistant'
import { DemandeArretee, type Progression } from '../core/ia/modele'
import { appliquerPlan, resumerPlan, type ActionMemoire, type Plan } from '../core/ia/plan'
import { modeleCompatibleOpenAI } from '../adapters/ia/compatible-openai'
import { enregistrerConversation, lireConversation, type ReglagesIA, type TourGarde } from '../adapters/ia/reglages'
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

export type Tour = { demande: string; resultat: Resultat; memoire?: MentionMemoire[] }

export const texteMention = (a: ActionMemoire) => `${a.type === 'retenir' ? 'Retenu' : 'Oublié'} : ${a.fait}`
const mentionsFaites = (t: Tour) => (t.memoire ?? []).filter((m) => m.etat !== 'annule').map((m) => texteMention(m.action))

/** Ce que le modèle relit d'un tour passé, mentions de mémoire comprises. */
function echange(t: Tour): Echange | null {
  const e = echangeSansMemoire(t)
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
  const memoire = mentions.length > 0 ? { memoire: mentions } : {}
  if (r.type === 'reponse') return { demande: t.demande, type: 'reponse', texte: r.texte, ...memoire }
  if (r.type === 'erreur') return { demande: t.demande, type: 'erreur', texte: r.message }
  if (r.type === 'arrete') return { demande: t.demande, type: 'arrete', texte: r.texte }
  return { demande: t.demande, type: 'plan', texte: r.resume, statut: r.statut === 'applique' ? 'applique' : 'annule', ...memoire }
}

function depuisGarde(g: TourGarde): Tour {
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

/**
 * Conversation d'un dossier : chaque demande relit les derniers échanges, si
 * bien qu'on peut répondre à une question du modèle. Gardée dans le navigateur ;
 * un plan n'est applicable que dans la session qui l'a reçu.
 */
export class SessionAssistant {
  private tours: Tour[]
  private arret: AbortController | null = null
  private abonnes = new Set<() => void>()
  /** Demande en cours de saisie : retrouvée quand on rouvre le panneau. */
  brouillon = ''

  constructor(
    private readonly espace: DepotEspace,
    private readonly dossier: string,
  ) {
    this.tours = lireConversation(dossier).map(depuisGarde)
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

  /** `garder` : faux pour un simple progrès de la réponse, qui ne vaut pas une écriture dans le navigateur. */
  private changer(tours: Tour[], garder = true) {
    this.tours = tours
    if (garder) enregistrerConversation(this.dossier, tours.flatMap((t) => versGarde(t) ?? []))
    this.abonnes.forEach((f) => f())
  }

  private remplacer(i: number, resultat: Resultat, garder = true) {
    this.changer(
      this.tours.map((t, j) => (j === i ? { ...t, resultat } : t)),
      garder,
    )
  }

  async envoyer(texte: string, o: { reglages: ReglagesIA; baseOuverte: string | null }) {
    if (texte.trim() === '' || this.enCours()) return
    // Une proposition restée sans réponse est abandonnée par la nouvelle demande.
    const passes = this.tours.map((t): Tour => (t.resultat.type === 'plan' && t.resultat.statut === 'attente' ? { ...t, resultat: { ...t.resultat, statut: 'annule' } } : t))
    const i = passes.length
    const depuis = performance.now()
    const arret = new AbortController()
    this.arret = arret
    this.changer([...passes, { demande: texte.trim(), resultat: { type: 'envoi', depuis } }])
    let recu: Progression | undefined
    try {
      const r = await proposer(modeleCompatibleOpenAI(o.reglages), this.espace, texte.trim(), {
        aujourdhui: aujourdhui(),
        baseOuverte: o.baseOuverte,
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

  nouvelle() {
    if (!this.enCours()) this.changer([])
  }
}
