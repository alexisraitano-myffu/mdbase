import { useRef, useState } from 'react'
import { filtreDePastille, operateurParDefaut, operateursPour, SANS_VALEUR } from '../core/filtres'
import { colonne as colonneDe, type Colonne, type Schema } from '../core/schema'
import type { FiltreRapide, Operateur } from '../core/vue'
import { colonnesFiltrables, LIBELLES_OPERATEURS, ValeurFiltre } from './EditeurFiltres'
import { titreDe, useEspace } from './contexte-espace'
import { Flottant } from './flottant'
import { ChevronDown, Plus } from 'lucide-react'
import { Icone } from './icones'

type Props = { schema: Schema; pastilles: FiltreRapide[]; changer: (p: FiltreRapide[]) => void }

/**
 * Filtres rapides (spec §7) : des colonnes épinglées au-dessus de la vue,
 * réglées depuis leur pastille. Une pastille non réglée ne filtre rien.
 */
export function Pastilles({ schema, pastilles, changer }: Props) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [choix, setChoix] = useState(false)
  const libres = colonnesFiltrables(schema).filter((c) => !pastilles.some((p) => p.colonne === c.cle))
  const remplacer = (i: number, p: FiltreRapide | null) =>
    changer(p === null ? pastilles.filter((_, j) => j !== i) : pastilles.map((x, j) => (j === i ? p : x)))

  return (
    <div className="filtres-rapides">
      {pastilles.map((p, i) => {
        const c = colonneDe(schema, p.colonne)
        return c ? (
          <PastilleFiltre key={p.colonne} schema={schema} colonne={c} pastille={p} changer={(n) => remplacer(i, n)} />
        ) : null
      })}
      {libres.length > 0 && (
        <button ref={ancre} className="discret ajout-pastille" onClick={() => setChoix(true)}>
          <Icone de={Plus} /> Filtre rapide
        </button>
      )}
      {choix && (
        <Flottant ancre={ancre.current} fermer={() => setChoix(false)}>
          {libres.map((c) => (
            <button
              key={c.cle}
              className="option"
              onClick={() => {
                setChoix(false)
                changer([...pastilles, { colonne: c.cle, operateur: operateurParDefaut(c) }])
              }}
            >
              {c.nom}
            </button>
          ))}
        </Flottant>
      )}
    </div>
  )
}

function PastilleFiltre(p: { schema: Schema; colonne: Colonne; pastille: FiltreRapide; changer: (p: FiltreRapide | null) => void }) {
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const { colonne, pastille } = p
  const operateur = pastille.operateur ?? operateurParDefaut(colonne)
  const actif = filtreDePastille(p.schema, pastille) !== null
  const { etat } = useEspace()
  const valeurAffichee =
    colonne.type === 'relation' && typeof pastille.valeur === 'string'
      ? (titreDe(etat, colonne.cible, pastille.valeur) ?? `⚠ ${pastille.valeur}`)
      : pastille.valeur

  return (
    <>
      <button ref={ancre} className={`pilule ${actif ? 'active' : ''}`} onClick={() => setOuvert(true)}>
        {colonne.nom}
        {actif && <span className="resume">{' : '}{resumer(colonne, operateur, valeurAffichee)}</span>}
        <Icone de={ChevronDown} className="chevron" taille={12} />
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau-pastille">
            <div className="ligne-filtre">
              <strong>{colonne.nom}</strong>
              <select
                value={operateur}
                onChange={(e) => p.changer({ colonne: colonne.cle, operateur: e.target.value as Operateur })}
              >
                {operateursPour(colonne).map((o) => (
                  <option key={o} value={o}>
                    {LIBELLES_OPERATEURS[o]}
                  </option>
                ))}
              </select>
            </div>
            <ValeurFiltre
              colonne={colonne}
              filtre={{ colonne: colonne.cle, operateur, ...(pastille.valeur !== undefined && { valeur: pastille.valeur }) }}
              changer={(valeur) => p.changer({ ...pastille, operateur, valeur })}
            />
            <div className="boutons">
              {actif && (
                <button className="discret" onClick={() => p.changer({ colonne: colonne.cle, operateur })}>
                  Effacer
                </button>
              )}
              <button className="discret danger-texte" onClick={() => p.changer(null)}>
                Retirer la pastille
              </button>
            </div>
          </div>
        </Flottant>
      )}
    </>
  )
}

function resumer(c: Colonne, operateur: Operateur, valeur: unknown): string {
  if (SANS_VALEUR.includes(operateur)) return LIBELLES_OPERATEURS[operateur]
  const texte = (v: unknown): string =>
    v === 'aujourdhui'
      ? "aujourd'hui"
      : typeof v === 'boolean'
        ? v ? 'coché' : 'non coché'
        : c.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? v.split('-').reverse().join('/')
          : String(v)
  if (Array.isArray(valeur)) {
    const liste = valeur.map(texte)
    if (operateur === 'entre') return `${liste[0]} → ${liste[1]}`
    return liste.length > 2 ? `${liste.slice(0, 2).join(', ')} +${liste.length - 2}` : liste.join(', ')
  }
  const prefixes: Partial<Record<Operateur, string>> = {
    different_de: '≠',
    ne_contient_pas: 'sans',
    commence_par: 'commence par',
    finit_par: 'finit par',
    superieur: '>',
    inferieur: '<',
    superieur_egal: '≥',
    inferieur_egal: '≤',
    avant: 'avant',
    apres: 'après',
    jours_passes: 'derniers jours :',
    jours_a_venir: 'prochains jours :',
  }
  const prefixe = prefixes[operateur]
  return prefixe ? `${prefixe} ${texte(valeur)}` : texte(valeur)
}
