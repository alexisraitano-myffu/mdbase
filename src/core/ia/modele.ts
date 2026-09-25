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

export type RequeteIA = { messages: MessageIA[]; outils: DefinitionOutil[] }
export type ReponseIA = { texte: string; appels: AppelOutil[] }

export type ModeleIA = (requete: RequeteIA) => Promise<ReponseIA>
