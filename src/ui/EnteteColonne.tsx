import { useRef, useState } from 'react'
import type { DepotBase } from '../core/depot-base'
import { TYPES_CREABLES, type DepotEspace, type TypeCreable } from '../core/depot-espace'
import { calculsPour } from '../core/calcul'
import { CALCULS, type Calcul, type Colonne, type ColonneRelation, type ColonneRollup } from '../core/schema'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
import { EditeurFormule } from './EditeurFormule'
import { Flottant } from './flottant'
import { Plus, TriangleAlert } from 'lucide-react'
import { Icone, ICONES } from './icones'

export const NOMS_TYPES: Record<TypeCreable, string> = {
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
export function MenuColonne({
  espace,
  base,
  depot,
  colonne,
  fermer,
  ancre,
  masquer,
}: Props & { fermer: () => void; ancre: HTMLElement | null; /** Masque la colonne dans la vue courante. */ masquer?: (() => void) | undefined }) {
  const lancer = useLancer()
  const [nom, setNom] = useState(colonne.nom)
  const [confirmer, setConfirmer] = useState(false)
  const [formule, setFormule] = useState(false)
  const estTitre = colonne.cle === depot.schema.champTitre

  const renommer = () => {
    if (nom.trim() !== '' && nom !== colonne.nom) void lancer(espace.renommerColonne(base, colonne.cle, nom.trim()))
    fermer()
  }

  if (formule && colonne.type === 'formula') {
    return (
      <Flottant ancre={ancre} fermer={fermer} garderOuvert>
        <div className="titre-panneau">Formule « {colonne.nom} »</div>
        <EditeurFormule
          espace={espace}
          base={base}
          formule={colonne}
          annuler={fermer}
          enregistrer={(expression) => {
            void lancer(espace.modifierFormule(base, colonne.cle, expression))
            fermer()
          }}
        />
      </Flottant>
    )
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
      {colonne.type === 'rollup' && <ReglagesRollup espace={espace} base={base} colonne={colonne} />}
      {colonne.type === 'formula' && (
        <button className="option" onClick={() => setFormule(true)}>
          <Icone de={ICONES.formula} />
          Modifier la formule…
        </button>
      )}
      {masquer && !estTitre && (
        <button
          className="option"
          onClick={() => {
            masquer()
            fermer()
          }}
        >
          Masquer dans cette vue
        </button>
      )}
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
      {colonne.type === 'relation' && <NettoyerLiens espace={espace} base={base} cle={colonne.cle} fermer={fermer} />}
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

/** Retire d'un coup les liens cassés d'une relation (ids qui ne correspondent plus à aucune ligne). */
function NettoyerLiens({ espace, base, cle, fermer }: { espace: DepotEspace; base: string; cle: string; fermer: () => void }) {
  const n = espace.liensCasses(base, cle).reduce((total, x) => total + x.ids.length, 0)
  if (n === 0) return null
  return (
    <button
      className="option"
      title="Liens vers des lignes supprimées ou introuvables : ils sont retirés des fichiers qui les portent"
      onClick={() => {
        espace.nettoyerLiensCasses(base, cle)
        fermer()
      }}
    >
      <Icone de={TriangleAlert} />
      {n === 1 ? 'Retirer le lien cassé' : `Retirer les ${n} liens cassés`}
    </button>
  )
}

/** Relation, colonne remontée et calcul d'un rollup existant, modifiables (spec §5). */
function ReglagesRollup({ espace, base, colonne }: { espace: DepotEspace; base: string; colonne: ColonneRollup }) {
  const lancer = useLancer()
  const { etat } = useEspace()
  const schema = etat.bases.get(base)?.depot?.schema
  const relations = (schema?.colonnes ?? []).filter((c): c is ColonneRelation => c.type === 'relation')
  const relation = relations.find((r) => r.cle === colonne.relation)
  const cible = relation && etat.bases.get(relation.cible)?.depot?.schema
  const champ = cible?.colonnes.find((c) => c.cle === colonne.champ)
  const modifier = (m: Parameters<DepotEspace['modifierRollup']>[2]) => void lancer(espace.modifierRollup(base, colonne.cle, m))

  return (
    <div className="reglages-rollup">
      <label>
        Relation
        <select
          value={colonne.relation}
          onChange={(e) => {
            const r = relations.find((x) => x.cle === e.target.value)!
            const s = etat.bases.get(r.cible)?.depot?.schema
            const c = s && (s.colonnes.find((x) => x.cle === colonne.champ) ?? s.colonnes.find((x) => x.cle === s.champTitre))
            if (!c) return
            const calcul = calculsPour(c).includes(colonne.calcul as Calcul) ? (colonne.calcul as Calcul) : 'afficher'
            modifier({ relation: r.cle, champ: c.cle, calcul })
          }}
        >
          {!relation && <option value={colonne.relation}>⚠ {colonne.relation}</option>}
          {relations.map((r) => (
            <option key={r.cle} value={r.cle}>
              {r.nom}
            </option>
          ))}
        </select>
      </label>
      <label>
        Colonne
        <select
          value={colonne.champ}
          onChange={(e) => {
            const c = cible?.colonnes.find((x) => x.cle === e.target.value)
            if (!c) return
            const calcul = calculsPour(c).includes(colonne.calcul as Calcul) ? (colonne.calcul as Calcul) : 'afficher'
            modifier({ champ: c.cle, calcul })
          }}
        >
          {!champ && <option value={colonne.champ}>⚠ {colonne.champ}</option>}
          {(cible?.colonnes ?? []).map((c) => (
            <option key={c.cle} value={c.cle}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <label>
        Calcul
        <select value={colonne.calcul} onChange={(e) => modifier({ calcul: e.target.value as Calcul })}>
          {(champ ? calculsPour(champ) : CALCULS).map((c) => (
            <option key={c} value={c}>
              {LIBELLES_CALCULS[c]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export const LIBELLES_CALCULS: Record<Calcul, string> = {
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

type Etape =
  | { type: 'choix' }
  | { type: 'relation' }
  | { type: 'rollup-relation' }
  | { type: 'rollup-champ'; relation: ColonneRelation }
  | { type: 'rollup-calcul'; relation: ColonneRelation; champ: Colonne }
  | { type: 'formule' }

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
      <Icone de={Plus} />
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer} garderOuvert={etape.type === 'formule'}>
          {etape.type === 'formule' && (
            <>
              <div className="titre-panneau">Formule « {nom.trim() || 'Formule'} »</div>
              <EditeurFormule
                espace={espace}
                base={base}
                annuler={fermer}
                enregistrer={(expression) => {
                  void lancer(espace.ajouterFormule(base, nom.trim() || 'Formule', expression))
                  fermer()
                }}
              />
            </>
          )}
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
                  <Icone de={ICONES[t]} />
                  {NOMS_TYPES[t]}
                </button>
              ))}
              <button className="option" onClick={() => setEtape({ type: 'relation' })} disabled={autresBases.length === 0}>
                <Icone de={ICONES.relation} />
                Relation…
              </button>
              <button className="option" onClick={() => setEtape({ type: 'rollup-relation' })} disabled={relations.length === 0}>
                <Icone de={ICONES.rollup} />
                Rollup…
              </button>
              <button className="option" onClick={() => setEtape({ type: 'formule' })}>
                <Icone de={ICONES.formula} />
                Formule…
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
                  <Icone de={ICONES[c.type]} />
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
