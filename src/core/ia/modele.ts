// Interface d'un modèle de langage, indépendante du fournisseur (spec §12,
// « Module IA »). Le cœur ne fait aucun appel réseau : l'adaptateur qui parle
// à un service réel lui est injecté sous la forme d'un `ModeleIA`.

/** Appel d'outil demandé par le modèle ; `arguments` est le JSON brut qu'il a produit. */
export type AppelOutil = { id: string; nom: string; arguments: string }

export type MessageIA =
  | { role: 'system' | 'user'; contenu: string }
  | { role: 'assistant'; contenu: string; appels: AppelOutil[] }
  | { role: 'tool'; idAppel: string; contenu: string }

/** Outil proposé au modèle ; `parametres` est un schéma JSON. */
export type DefinitionOutil = { nom: string; description: string; parametres: Record<string, unknown> }

/** Ce que le cœur attend d'un `AbortSignal` du navigateur, sans dépendre du DOM. */
export type SignalArret = {
  readonly aborted: boolean
  addEventListener(type: 'abort', f: () => void): void
  removeEventListener(type: 'abort', f: () => void): void
}

/** Ce qui est déjà arrivé d'une réponse en cours : le texte, et les outils dont le nom est connu. */
export type Progression = { texte: string; outils: string[] }

export type RequeteIA = {
  messages: MessageIA[]
  outils: DefinitionOutil[]
  /** Arrêt demandé par l'utilisateur : la requête est coupée et `DemandeArretee` levée. */
  signal?: SignalArret
  /** Appelé à chaque morceau reçu, quand le service envoie sa réponse au fil de l'eau. */
  progression?: (p: Progression) => void
}
export type ReponseIA = { texte: string; appels: AppelOutil[] }

/** Levée quand l'utilisateur arrête une demande : ce n'est pas une panne, rien n'est à signaler. */
export class DemandeArretee extends Error {
  constructor() {
    super('Demande arrêtée.')
    this.name = 'DemandeArretee'
  }
}

export type ModeleIA = (requete: RequeteIA) => Promise<ReponseIA>
