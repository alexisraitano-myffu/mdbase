import { useRef, useState } from 'react'
import type { DepotBase } from '../core/depot-base'
import { TYPES_CREABLES, type DepotEspace, type TypeCreable } from '../core/depot-espace'
import type { Colonne } from '../core/schema'
import { useLancer } from './actions'
import { Flottant } from './flottant'

export const ICONES: Record<Colonne['type'], string> = {
  text: 'Aa',
  number: '#',
  date: '▦',
  checkbox: '☑',
  select: '◉',
  multiselect: '☰',
  url: '🔗',
  relation: '↗',
  rollup: '∑',
  formula: 'ƒ',
}

const NOMS_TYPES: Record<TypeCreable, string> = {
  text: 'Texte',
  number: 'Nombre',
  date: 'Date',
  checkbox: 'Case à cocher',
  select: 'Sélection',
  multiselect: 'Sélection multiple',
  url: 'Lien',
}

type Props = { espace: DepotEspace; base: string; depot: DepotBase; colonne: Colonne }

/** Menu d'une colonne : renommer, utiliser comme titre, supprimer (spec §5). */
export function MenuColonne({ espace, base, depot, colonne, fermer, ancre }: Props & { fermer: () => void; ancre: HTMLElement | null }) {
  const lancer = useLancer()
  const [nom, setNom] = useState(colonne.nom)
  const [confirmer, setConfirmer] = useState(false)
  const estTitre = colonne.cle === depot.schema.champTitre

  const renommer = () => {
    if (nom.trim() !== '' && nom !== colonne.nom) void lancer(espace.renommerColonne(base, colonne.cle, nom.trim()))
    fermer()
  }

  if (confirmer) {
    const touchees = depot.lignes().filter((l) => colonne.cle in l.cellules).length
    const dependants = espace.dependants(base, colonne.cle)
    return (
      <Flottant ancre={ancre} fermer={fermer}>
        <div className="confirmation">
          <strong>Supprimer « {colonne.nom} » ?</strong>
          <p>
            {touchees === 0
              ? 'Aucune ligne ne contient de valeur.'
              : `Le contenu de ${touchees} ligne${touchees > 1 ? 's' : ''} sera effacé.`}
          </p>
          {dependants.length > 0 && (
            <p className="invalide">
              Ces colonnes en dépendent et passeront en erreur : {dependants.join(', ')}
            </p>
          )}
          <div className="boutons">
            <button onClick={fermer}>Annuler</button>
            <button
              className="danger"
              onClick={() => {
                void lancer(espace.supprimerColonne(base, colonne.cle))
                fermer()
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      </Flottant>
    )
  }

  return (
    <Flottant ancre={ancre} fermer={renommer}>
      <input
        className="recherche-option"
        autoFocus
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && renommer()}
      />
      {colonne.type === 'text' && !estTitre && (
        <button
          className="option"
          onClick={() => {
            void lancer(espace.changerTitre(base, colonne.cle))
            fermer()
          }}
        >
          Utiliser comme titre
        </button>
      )}
      {estTitre ? (
        <div className="option discret">Colonne titre : choisis-en une autre pour pouvoir la supprimer</div>
      ) : (
        <button className="option danger-texte" onClick={() => setConfirmer(true)}>
          Supprimer la colonne
        </button>
      )}
    </Flottant>
  )
}

/** Bouton « + » en bout d'en-tête : nom puis type de la nouvelle colonne. */
export function AjoutColonne({ espace, base }: { espace: DepotEspace; base: string }) {
  const lancer = useLancer()
  const ancre = useRef<HTMLDivElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const fermer = () => {
    setOuvert(false)
    setNom('')
  }
  const creer = (type: TypeCreable) => {
    void lancer(espace.ajouterColonne(base, nom.trim() || NOMS_TYPES[type], type))
    fermer()
  }
  return (
    <div ref={ancre} className="cellule-entete ajout" onClick={() => setOuvert(true)} title="Ajouter une colonne">
      +
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer}>
          <input
            className="recherche-option"
            autoFocus
            placeholder="Nom de la colonne"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && creer('text')}
          />
          {TYPES_CREABLES.map((t) => (
            <button key={t} className="option" onClick={() => creer(t)}>
              <span className="icone">{ICONES[t]}</span>
              {NOMS_TYPES[t]}
            </button>
          ))}
        </Flottant>
      )}
    </div>
  )
}
