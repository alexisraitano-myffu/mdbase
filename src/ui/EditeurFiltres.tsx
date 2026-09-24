import { useEffect, useRef, useState } from 'react'
import { operateursPour } from '../core/filtres'
import { useEspace } from './contexte-espace'
import { natureDe, type Colonne, type Schema } from '../core/schema'
import type { Filtre, Operateur } from '../core/vue'

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
export function colonnesFiltrables(schema: Schema): Colonne[] {
  return schema.colonnes.filter((c) => c.type !== 'formula')
}

/** Liste de filtres combinés en ET, éditable. Chaque changement est remonté aussitôt. */
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
            <select
              value={f.colonne}
              onChange={(e) => {
                const nc = colonnes.find((x) => x.cle === e.target.value)!
                remplacer(i, { colonne: nc.cle, operateur: operateursPour(nc)[0]! })
              }}
            >
              {!c && <option value={f.colonne}>{f.colonne} (supprimée)</option>}
              {colonnes.map((x) => (
                <option key={x.cle} value={x.cle}>
                  {x.nom}
                </option>
              ))}
            </select>
            {c && (
              <select
                value={f.operateur}
                onChange={(e) => remplacer(i, { colonne: f.colonne, operateur: e.target.value as Operateur })}
              >
                {operateursPour(c).map((o) => (
                  <option key={o} value={o}>
                    {LIBELLES_OPERATEURS[o]}
                  </option>
                ))}
              </select>
            )}
            {c && <ValeurFiltre colonne={c} filtre={f} changer={(valeur) => remplacer(i, { ...f, valeur })} />}
            <button className="discret" onClick={() => changer(filtres.filter((_, j) => j !== i))} aria-label="Retirer le filtre">
              ×
            </button>
          </div>
        )
      })}
      {colonnes[0] && (
        <button
          className="discret ajout-filtre"
          onClick={() => changer([...filtres, { colonne: colonnes[0]!.cle, operateur: operateursPour(colonnes[0]!)[0]! }])}
        >
          + Ajouter un filtre
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
      <select value={String(filtre.valeur === true || filtre.valeur === 'true')} onChange={(e) => changer(e.target.value === 'true')}>
        <option value="true">coché</option>
        <option value="false">non coché</option>
      </select>
    )
  }

  if ((colonne.type === 'select' || colonne.type === 'multiselect') && op !== 'parmi') {
    return (
      <select value={String(filtre.valeur ?? '')} onChange={(e) => changer(e.target.value)}>
        <option value="" disabled>
          choisir…
        </option>
        {colonne.options.map((o) => (
          <option key={o.label}>{o.label}</option>
        ))}
      </select>
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
            {o.label}
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
        <span>
          <input type="date" value={a ?? ''} onChange={(e) => changer([e.target.value, b ?? ''])} /> et{' '}
          <input type="date" value={b ?? ''} onChange={(e) => changer([a ?? '', e.target.value])} />
        </span>
      )
    }
    const estAujourdhui = filtre.valeur === 'aujourdhui'
    return (
      <span>
        <select value={estAujourdhui ? 'aujourdhui' : 'date'} onChange={(e) => changer(e.target.value === 'aujourdhui' ? 'aujourdhui' : '')}>
          <option value="date">date précise</option>
          <option value="aujourdhui">aujourd'hui</option>
        </select>
        {!estAujourdhui && <input type="date" value={String(filtre.valeur ?? '')} onChange={(e) => changer(e.target.value)} />}
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
    <span>
      <input
        type={p.type ?? 'text'}
        value={saisie}
        placeholder={p.placeholder ?? 'valeur'}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => e.key === 'Enter' && valider()}
      />
      {p.suffixe && ` ${p.suffixe}`}
    </span>
  )
}

/** Choix d'une ligne de la base liée, par son titre (filtre sur une relation). */
function ChoixLigne({ cible, valeur, changer }: { cible: string; valeur: string; changer: (v: unknown) => void }) {
  const { etat } = useEspace()
  const lignes = [...(etat.titres.get(cible) ?? new Map<string, string>())].sort(([, a], [, b]) => a.localeCompare(b, 'fr'))
  return (
    <select value={valeur} onChange={(e) => changer(e.target.value)}>
      <option value="" disabled>
        choisir…
      </option>
      {valeur && !lignes.some(([id]) => id === valeur) && <option value={valeur}>⚠ {valeur}</option>}
      {lignes.map(([id, titre]) => (
        <option key={id} value={id}>
          {titre || 'Sans titre'}
        </option>
      ))}
    </select>
  )
}
