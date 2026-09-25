import { useMemo, useRef, useState } from 'react'
import type { SourceArbre } from '../core/arbre-temps'
import type { Dashboard, FiltreGlobal, PastilleGlobale } from '../core/dashboard'
import { retenues } from '../core/filtre-global'
import { operateurParDefaut } from '../core/filtres'
import { colonne as colonneDe } from '../core/schema'
import { colonnesFiltrables, EditeurFiltres } from './EditeurFiltres'
import { titreDe, useEspace } from './contexte-espace'
import { Flottant } from './flottant'
import { PastilleFiltre } from './Pastilles'
import { useAujourdhui } from './useAujourdhui'
import { ChevronDown, Plus } from 'lucide-react'
import { Icone } from './icones'
import { useConsultation } from './mode'

// Filtres globaux d'un dashboard (spec §10) : bouton « Filtrer » et pastilles
// qui valent pour tous les blocs.

/** Lignes retenues par base filtrée, recalculées quand l'espace ou les filtres changent. */
export function useRetenues(d: Dashboard): ReadonlyMap<string, ReadonlySet<string>> {
  const { etat } = useEspace()
  const aujourdhui = useAujourdhui()
  return useMemo(() => {
    if (d.filtres.length === 0 && d.filtresRapides.length === 0) return new Map()
    const bases = [...etat.bases.values()].filter((b) => b.depot)
    const src: SourceArbre = {
      schemas: new Map(bases.map((b) => [b.id, b.depot!.schema])),
      lignes: new Map(bases.map((b) => [b.id, b.depot!.lignes()])),
      calculs: etat.calculs,
    }
    return retenues(src, d.filtres, d.filtresRapides, { aujourdhui })
  }, [etat, d.filtres, d.filtresRapides, aujourdhui])
}

type Props = {
  dashboard: Dashboard
  changerFiltres: (f: FiltreGlobal[]) => void
  changerPastilles: (p: PastilleGlobale[]) => void
}

export function FiltresDashboard({ dashboard: d, changerFiltres, changerPastilles }: Props) {
  const { etat } = useEspace()
  const nomBase = (id: string) => etat.bases.get(id)?.depot?.schema.nom ?? id
  const lecture = useConsultation()
  // Consultation sans pastille : rien à montrer, pas même une rangée vide.
  if (lecture && d.filtresRapides.length === 0) return null
  const remplacer = (i: number, p: PastilleGlobale | null) =>
    changerPastilles(p === null ? d.filtresRapides.filter((_, j) => j !== i) : d.filtresRapides.map((x, j) => (j === i ? p : x)))

  return (
    <div className="filtres-dashboard">
      {!lecture && <PanneauFiltres dashboard={d} changer={changerFiltres} />}
      <div className="filtres-rapides">
        {d.filtresRapides.map((p, i) => {
          const schema = etat.bases.get(p.base)?.depot?.schema
          if (!schema) return null
          if (p.colonne === undefined) return <PastilleLignes key={`${p.base}/lignes`} pastille={p} nom={schema.nom} changer={(n) => remplacer(i, n)} />
          const c = colonneDe(schema, p.colonne)
          if (!c) return null
          return (
            <PastilleFiltre
              key={`${p.base}/${p.colonne}`}
              schema={schema}
              colonne={c}
              libelle={`${nomBase(p.base)} › ${c.nom}`}
              pastille={{ colonne: c.cle, ...(p.operateur && { operateur: p.operateur }), ...(p.valeur !== undefined && { valeur: p.valeur }) }}
              changer={(n) => remplacer(i, n && { base: p.base, ...n })}
            />
          )
        })}
        {!lecture && <AjoutPastille pastilles={d.filtresRapides} ajouter={(p) => changerPastilles([...d.filtresRapides, p])} />}
      </div>
    </div>
  )
}

/** « Filtrer » : les filtres d'une base à la fois, choisie en tête du panneau. */
function PanneauFiltres({ dashboard: d, changer }: { dashboard: Dashboard; changer: (f: FiltreGlobal[]) => void }) {
  const { etat } = useEspace()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const bases = [...etat.bases.values()].filter((b) => b.depot)
  const premiere = d.filtres[0]?.base ?? d.rangees[0]?.blocs[0]?.base ?? bases[0]?.id
  const [base, setBase] = useState(premiere)
  const schema = base ? etat.bases.get(base)?.depot?.schema : undefined
  const compte = (id: string) => d.filtres.filter((f) => f.base === id).length
  return (
    <>
      <button ref={ancre} className={`discret outil ${d.filtres.length > 0 ? 'actif' : ''}`} onClick={() => setOuvert(true)}>
        Filtrer{d.filtres.length > 0 && ` (${d.filtres.length})`}
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau">
            <div className="discret aide-reglage">Pour tous les blocs : ceux d’une autre base suivent leurs relations vers celle-ci.</div>
            <label className="case-reglage">
              Base
              <select value={base ?? ''} onChange={(e) => setBase(e.target.value)}>
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.depot!.schema.nom}
                    {compte(b.id) > 0 && ` (${compte(b.id)})`}
                  </option>
                ))}
              </select>
            </label>
            {schema && base && (
              <EditeurFiltres
                schema={schema}
                filtres={d.filtres.filter((f) => f.base === base).map(({ base: _, ...f }) => f)}
                changer={(fs) => changer([...d.filtres.filter((f) => f.base !== base), ...fs.map((f) => ({ ...f, base }))])}
              />
            )}
          </div>
        </Flottant>
      )}
    </>
  )
}

/** « + Filtre rapide » : une base, puis le choix de ses lignes ou une de ses colonnes. */
function AjoutPastille({ pastilles, ajouter }: { pastilles: PastilleGlobale[]; ajouter: (p: PastilleGlobale) => void }) {
  const { etat } = useEspace()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [base, setBase] = useState<string | null>(null)
  const fermer = () => {
    setOuvert(false)
    setBase(null)
  }
  const schema = base ? etat.bases.get(base)?.depot?.schema : undefined
  const prise = (colonne?: string) => pastilles.some((p) => p.base === base && p.colonne === colonne)
  return (
    <>
      <button ref={ancre} className="discret ajout-pastille" onClick={() => setOuvert(true)}>
        <Icone de={Plus} /> Filtre rapide
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer}>
          {!base || !schema ? (
            <>
              <div className="option discret">Sur quelle base ?</div>
              {[...etat.bases.values()]
                .filter((b) => b.depot)
                .map((b) => (
                  <button key={b.id} className="option" onClick={() => setBase(b.id)}>
                    {b.depot!.schema.nom}
                  </button>
                ))}
            </>
          ) : (
            <>
              {!prise() && (
                <button className="option" onClick={() => (ajouter({ base }), fermer())}>
                  Choisir des lignes de {schema.nom}
                </button>
              )}
              <div className="option discret">Ou une colonne :</div>
              {colonnesFiltrables(schema)
                .filter((c) => !prise(c.cle))
                .map((c) => (
                  <button key={c.cle} className="option" onClick={() => (ajouter({ base, colonne: c.cle, operateur: operateurParDefaut(c) }), fermer())}>
                    {c.nom}
                  </button>
                ))}
            </>
          )}
        </Flottant>
      )}
    </>
  )
}

/** Pastille sans colonne : des lignes de la base, cochées dans une liste (avec recherche). */
function PastilleLignes({ pastille, nom, changer }: { pastille: PastilleGlobale; nom: string; changer: (p: PastilleGlobale | null) => void }) {
  const { etat } = useEspace()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const lecture = useConsultation()
  const choisies = Array.isArray(pastille.valeur) ? pastille.valeur.filter((x): x is string => typeof x === 'string') : []
  const titres = [...(etat.titres.get(pastille.base) ?? new Map<string, string>())]
  const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const visibles = titres.filter(([, t]) => normal(t).includes(normal(recherche))).sort((a, b) => a[1].localeCompare(b[1]))
  const resume = choisies.map((id) => titreDe(etat, pastille.base, id) ?? `⚠ ${id}`)
  const basculer = (id: string) => {
    const suivantes = choisies.includes(id) ? choisies.filter((x) => x !== id) : [...choisies, id]
    changer({ base: pastille.base, ...(suivantes.length > 0 && { valeur: suivantes }) })
  }
  return (
    <>
      <button ref={ancre} className={`pilule ${choisies.length > 0 ? 'active' : ''}`} onClick={() => setOuvert(true)}>
        {nom}
        {choisies.length > 0 && (
          <span className="resume">
            {' : '}
            {resume.length > 2 ? `${resume.slice(0, 2).join(', ')} +${resume.length - 2}` : resume.join(', ')}
          </span>
        )}
        <Icone de={ChevronDown} className="chevron" taille={12} />
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau-pastille">
            <input className="recherche-option" autoFocus placeholder={`Chercher dans ${nom}`} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <div className="liste-lignes-pastille">
              {visibles.map(([id, t]) => (
                <label key={id} className="case-reglage">
                  <input type="checkbox" checked={choisies.includes(id)} onChange={() => basculer(id)} />
                  {t || 'Sans titre'}
                </label>
              ))}
              {visibles.length === 0 && <div className="discret">Aucune ligne</div>}
            </div>
            <div className="boutons">
              {choisies.length > 0 && (
                <button className="discret" onClick={() => changer({ base: pastille.base })}>
                  Effacer
                </button>
              )}
              {!lecture && (
                <button className="discret danger-texte" onClick={() => changer(null)}>
                  Retirer la pastille
                </button>
              )}
            </div>
          </div>
        </Flottant>
      )}
    </>
  )
}
