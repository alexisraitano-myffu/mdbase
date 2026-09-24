import { useRef, useState } from 'react'
import type { DepotBase } from '../core/depot-base'
import { TYPES_CREABLES, type DepotEspace, type TypeCreable } from '../core/depot-espace'
import { natureDe, type Calcul, type Colonne, type ColonneRelation } from '../core/schema'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
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
            {colonne.type === 'relation'
              ? `La relation et sa colonne miroir dans ${espace.etat().bases.get(colonne.cible)?.depot?.schema.nom ?? colonne.cible} seront supprimées, avec tous les liens.`
              : colonne.type === 'rollup' || colonne.type === 'formula'
                ? 'Colonne calculée : aucune donnée n’est effacée.'
                : touchees === 0
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

const LIBELLES_CALCULS: Record<Calcul, string> = {
  afficher: 'Afficher les valeurs',
  compter: 'Compter les lignes',
  compter_valeurs: 'Compter les valeurs',
  compter_uniques: 'Compter les valeurs uniques',
  compter_vides: 'Compter les vides',
  compter_non_vides: 'Compter les non vides',
  pourcent_coches: '% cochées',
  pourcent_non_coches: '% non cochées',
  somme: 'Somme',
  moyenne: 'Moyenne',
  mediane: 'Médiane',
  min: 'Minimum',
  max: 'Maximum',
  amplitude: 'Amplitude (max − min)',
  date_plus_tot: 'Date la plus tôt',
  date_plus_tard: 'Date la plus tard',
}

/** Calculs qui ont un sens pour la nature du champ remonté. */
function calculsPour(champ: Colonne): Calcul[] {
  const comptes: Calcul[] = ['afficher', 'compter', 'compter_valeurs', 'compter_uniques', 'compter_vides', 'compter_non_vides']
  switch (natureDe(champ)) {
    case 'nombre':
      return [...comptes, 'somme', 'moyenne', 'mediane', 'min', 'max', 'amplitude']
    case 'case':
      return [...comptes, 'pourcent_coches', 'pourcent_non_coches']
    case 'date':
      return [...comptes, 'date_plus_tot', 'date_plus_tard']
    default:
      return comptes
  }
}

type Etape =
  | { type: 'choix' }
  | { type: 'relation' }
  | { type: 'rollup-relation' }
  | { type: 'rollup-champ'; relation: ColonneRelation }
  | { type: 'rollup-calcul'; relation: ColonneRelation; champ: Colonne }

/** Bouton « + » en bout d'en-tête : nom puis type de la nouvelle colonne (relation et rollup en plusieurs étapes). */
export function AjoutColonne({ espace, base }: { espace: DepotEspace; base: string }) {
  const lancer = useLancer()
  const { etat } = useEspace()
  const ancre = useRef<HTMLDivElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const [etape, setEtape] = useState<Etape>({ type: 'choix' })
  const schema = etat.bases.get(base)?.depot?.schema
  const schemaDe = (id: string) => etat.bases.get(id)?.depot?.schema

  const fermer = () => {
    setOuvert(false)
    setNom('')
    setEtape({ type: 'choix' })
  }
  const creer = (type: TypeCreable) => {
    void lancer(espace.ajouterColonne(base, nom.trim() || NOMS_TYPES[type], type))
    fermer()
  }

  const autresBases = [...etat.bases.values()].filter((b) => b.id !== base && b.depot)
  const relations = (schema?.colonnes ?? []).filter((c): c is ColonneRelation => c.type === 'relation')

  return (
    <div ref={ancre} className="cellule-entete ajout" onClick={() => setOuvert(true)} title="Ajouter une colonne">
      +
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer}>
          {etape.type === 'choix' && (
            <>
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
              <button className="option" onClick={() => setEtape({ type: 'relation' })} disabled={autresBases.length === 0}>
                <span className="icone">{ICONES.relation}</span>
                Relation…
              </button>
              <button className="option" onClick={() => setEtape({ type: 'rollup-relation' })} disabled={relations.length === 0}>
                <span className="icone">{ICONES.rollup}</span>
                Rollup…
              </button>
            </>
          )}

          {etape.type === 'relation' && (
            <>
              <div className="option discret">Relier à la base :</div>
              {autresBases.map((b) => (
                <button
                  key={b.id}
                  className="option"
                  onClick={() => {
                    void lancer(espace.ajouterRelation(base, nom.trim() || schemaDe(b.id)!.nom, b.id))
                    fermer()
                  }}
                >
                  {schemaDe(b.id)!.nom}
                </button>
              ))}
            </>
          )}

          {etape.type === 'rollup-relation' && (
            <>
              <div className="option discret">Via la relation :</div>
              {relations.map((r) => (
                <button key={r.cle} className="option" onClick={() => setEtape({ type: 'rollup-champ', relation: r })}>
                  {r.nom} <span className="discret">→ {schemaDe(r.cible)?.nom ?? r.cible}</span>
                </button>
              ))}
            </>
          )}

          {etape.type === 'rollup-champ' && (
            <>
              <div className="option discret">Remonter la colonne de {schemaDe(etape.relation.cible)?.nom} :</div>
              {(schemaDe(etape.relation.cible)?.colonnes ?? []).map((c) => (
                <button
                  key={c.cle}
                  className="option"
                  onClick={() => setEtape({ type: 'rollup-calcul', relation: etape.relation, champ: c })}
                >
                  <span className="icone">{ICONES[c.type]}</span>
                  {c.nom}
                </button>
              ))}
            </>
          )}

          {etape.type === 'rollup-calcul' && (
            <>
              <div className="option discret">Calcul sur « {etape.champ.nom} » :</div>
              {calculsPour(etape.champ).map((calcul) => (
                <button
                  key={calcul}
                  className="option"
                  onClick={() => {
                    const defaut = `${LIBELLES_CALCULS[calcul]} ${etape.champ.nom}`
                    void lancer(espace.ajouterRollup(base, nom.trim() || defaut, etape.relation.cle, etape.champ.cle, calcul))
                    fermer()
                  }}
                >
                  {LIBELLES_CALCULS[calcul]}
                </button>
              ))}
            </>
          )}
        </Flottant>
      )}
    </div>
  )
}
