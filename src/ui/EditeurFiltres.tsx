import { useEffect, useRef, useState } from 'react'
import { operateursPour } from '../core/filtres'
import { useEspace } from './contexte-espace'
import { natureDe, type Colonne, type Schema } from '../core/schema'
import type { Filtre, Operateur } from '../core/vue'
import { Plus, X } from 'lucide-react'
import { Icone, ICONES } from './icones'
import { Choix, type EntreeChoix } from './Choix'
import { couleurOption } from './couleurs'

export const LIBELLES_OPERATEURS: Record<Operateur, string> = {
  vide: 'est vide',
  non_vide: "n'est pas vide",
  egal: 'est',
  different_de: "n'est pas",
  contient: 'contient',
  ne_contient_pas: 'ne contient pas',
  commence_par: 'commence par',
  finit_par: 'finit par',
  superieur: '>',
  inferieur: '<',
  superieur_egal: '≥',
  inferieur_egal: '≤',
  avant: 'avant',
  apres: 'après',
  entre: 'entre',
  aujourdhui: "aujourd'hui",
  cette_semaine: 'cette semaine',
  ce_mois: 'ce mois-ci',
  jours_passes: 'dans les jours passés',
  jours_a_venir: 'dans les jours à venir',
  parmi: 'parmi',
}

/** Toutes les colonnes se filtrent et se trient, calculées comprises ; les formules au jalon 10. */
/** Colonnes filtrables et triables ; une formule en erreur n'a pas de type, donc pas d'opérateurs. */
export function colonnesFiltrables(schema: Schema): Colonne[] {
  return schema.colonnes.filter((c) => c.type !== 'formula' || c.resultat !== undefined)
}

/** Entrées d'une liste de colonnes, avec l'icône de leur type. */
export function entreesColonnes(colonnes: Colonne[]): EntreeChoix[] {
  return colonnes.map((c) => ({ valeur: c.cle, libelle: c.nom, icone: ICONES[c.type] }))
}

export const entreesOperateurs = (c: Colonne): EntreeChoix[] => operateursPour(c).map((o) => ({ valeur: o, libelle: LIBELLES_OPERATEURS[o] }))

/** Liste de filtres combinés en ET, éditable, une ligne par filtre. Chaque changement est remonté aussitôt. */
export function EditeurFiltres({ schema, filtres, changer }: { schema: Schema; filtres: Filtre[]; changer: (f: Filtre[]) => void }) {
  const colonnes = colonnesFiltrables(schema)
  const remplacer = (i: number, f: Filtre) => changer(filtres.map((x, j) => (j === i ? f : x)))
  return (
    <div className="editeur-filtres">
      {filtres.length === 0 && <div className="discret">Aucun filtre</div>}
      {filtres.map((f, i) => {
        const c = colonnes.find((x) => x.cle === f.colonne)
        return (
          <div key={i} className="ligne-filtre">
            <span className="liaison-filtre">{i === 0 ? 'Où' : 'Et'}</span>
            <Choix
              valeur={f.colonne}
              entrees={entreesColonnes(colonnes)}
              libelle="Colonne du filtre"
              inconnue={`${f.colonne} (supprimée)`}
              changer={(v) => {
                const nc = colonnes.find((x) => x.cle === v)!
                remplacer(i, { colonne: nc.cle, operateur: operateursPour(nc)[0]! })
              }}
            />
            {c && (
              <Choix
                valeur={f.operateur}
                entrees={entreesOperateurs(c)}
                libelle="Opérateur"
                changer={(v) => remplacer(i, { colonne: f.colonne, operateur: v as Operateur })}
              />
            )}
            <span className="valeur-filtre">
              {c && <ValeurFiltre colonne={c} filtre={f} changer={(valeur) => remplacer(i, { ...f, valeur })} />}
            </span>
            <button className="discret retirer" onClick={() => changer(filtres.filter((_, j) => j !== i))} aria-label="Retirer le filtre" title="Retirer le filtre">
              <Icone de={X} taille={14} />
            </button>
          </div>
        )
      })}
      {colonnes[0] && (
        <button
          className="discret ajout-filtre"
          onClick={() => changer([...filtres, { colonne: colonnes[0]!.cle, operateur: operateursPour(colonnes[0]!)[0]! }])}
        >
          <Icone de={Plus} /> Ajouter un filtre
        </button>
      )}
    </div>
  )
}

export function ValeurFiltre({ colonne, filtre, changer }: { colonne: Colonne; filtre: Filtre; changer: (v: unknown) => void }) {
  const op = filtre.operateur
  if (['vide', 'non_vide', 'aujourdhui', 'cette_semaine', 'ce_mois'].includes(op)) return null

  if (colonne.type === 'relation') return <ChoixLigne cible={colonne.cible} valeur={String(filtre.valeur ?? '')} changer={changer} />

  if (natureDe(colonne) === 'case') {
    return (
      <Choix
        valeur={String(filtre.valeur === true || filtre.valeur === 'true')}
        entrees={[
          { valeur: 'true', libelle: 'coché' },
          { valeur: 'false', libelle: 'non coché' },
        ]}
        libelle="Valeur"
        changer={(v) => changer(v === 'true')}
      />
    )
  }

  if ((colonne.type === 'select' || colonne.type === 'multiselect') && op !== 'parmi') {
    return (
      <Choix
        valeur={String(filtre.valeur ?? '')}
        entrees={colonne.options.map((o) => ({ valeur: o.label, libelle: o.label, couleur: o.couleur ?? 'gris' }))}
        libelle="Valeur"
        vide="Choisir"
        changer={changer}
      />
    )
  }

  if (colonne.type === 'select' && op === 'parmi') {
    const choisis = Array.isArray(filtre.valeur) ? filtre.valeur.map(String) : []
    return (
      <span className="choix-parmi">
        {colonne.options.map((o) => (
          <label key={o.label}>
            <input
              type="checkbox"
              checked={choisis.includes(o.label)}
              onChange={(e) => changer(e.target.checked ? [...choisis, o.label] : choisis.filter((x) => x !== o.label))}
            />
            <span className="pastille" style={{ background: couleurOption(o.couleur).fond, color: couleurOption(o.couleur).texte }}>
              {o.label}
            </span>
          </label>
        ))}
      </span>
    )
  }

  if (natureDe(colonne) === 'date') {
    if (op === 'jours_passes' || op === 'jours_a_venir') {
      return <ChampTexte valeur={String(filtre.valeur ?? '')} type="number" suffixe="jours" changer={(v) => changer(v === '' ? undefined : Number(v))} />
    }
    if (op === 'entre') {
      const [a, b] = Array.isArray(filtre.valeur) ? filtre.valeur.map(String) : ['', '']
      return (
        <span className="valeurs-filtre">
          <input type="date" value={a ?? ''} aria-label="Du" onChange={(e) => changer([e.target.value, b ?? ''])} />
          <span className="discret">et</span>
          <input type="date" value={b ?? ''} aria-label="Au" onChange={(e) => changer([a ?? '', e.target.value])} />
        </span>
      )
    }
    const estAujourdhui = filtre.valeur === 'aujourdhui'
    return (
      <span className="valeurs-filtre">
        <Choix
          valeur={estAujourdhui ? 'aujourdhui' : 'date'}
          entrees={[
            { valeur: 'date', libelle: 'date précise' },
            { valeur: 'aujourdhui', libelle: "aujourd'hui" },
          ]}
          libelle="Type de date"
          changer={(v) => changer(v === 'aujourdhui' ? 'aujourdhui' : '')}
        />
        {!estAujourdhui && <input type="date" value={String(filtre.valeur ?? '')} aria-label="Date" onChange={(e) => changer(e.target.value)} />}
      </span>
    )
  }

  return (
    <ChampTexte
      valeur={String(filtre.valeur ?? '')}
      type={natureDe(colonne) === 'nombre' ? 'number' : 'text'}
      changer={(v) => changer(natureDe(colonne) === 'nombre' && v !== '' ? Number(v) : v)}
    />
  )
}

/**
 * Champ validé à la sortie, sur Entrée, ou quand il disparaît (panneau fermé
 * par un clic extérieur : React ne déclenche alors pas onBlur). Évite de
 * réécrire la vue à chaque frappe.
 */
export function ChampTexte(p: {
  valeur: string
  type?: 'text' | 'number'
  suffixe?: string
  placeholder?: string
  changer: (v: string) => void
}) {
  const [saisie, setSaisie] = useState(p.valeur)
  const dernier = useRef({ saisie, valeur: p.valeur, changer: p.changer })
  dernier.current = { saisie, valeur: p.valeur, changer: p.changer }
  useEffect(
    () => () => {
      const d = dernier.current
      if (d.saisie !== d.valeur) d.changer(d.saisie)
    },
    [],
  )
  const valider = () => {
    if (saisie === p.valeur) return
    dernier.current.valeur = saisie // pas de seconde validation au démontage
    p.changer(saisie)
  }
  return (
    <span className="valeurs-filtre">
      <input
        type={p.type ?? 'text'}
        value={saisie}
        placeholder={p.placeholder ?? 'valeur'}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => e.key === 'Enter' && valider()}
      />
      {p.suffixe && <span className="discret">{p.suffixe}</span>}
    </span>
  )
}

/** Choix d'une ligne de la base liée, par son titre (filtre sur une relation) ; recherche au-delà de huit lignes. */
function ChoixLigne({ cible, valeur, changer }: { cible: string; valeur: string; changer: (v: unknown) => void }) {
  const { etat } = useEspace()
  const lignes = [...(etat.titres.get(cible) ?? new Map<string, string>())].sort(([, a], [, b]) => a.localeCompare(b, 'fr'))
  return (
    <Choix
      valeur={valeur}
      entrees={lignes.map(([id, titre]) => ({ valeur: id, libelle: titre || 'Sans titre' }))}
      libelle="Ligne liée"
      vide="Choisir une ligne"
      changer={changer}
    />
  )
}
