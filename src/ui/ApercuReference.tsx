import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { choisirMiseEnPage, proprietesVisibles } from '../core/mise-en-page'
import { DOSSIER_WIKI } from '../core/wiki'
import { ValeurCompacte } from './cellules'
import { titreDe, useEspace } from './contexte-espace'

// Aperçu d'une ligne citée (spec §22, « Liens, pas de copie ») : au survol de
// sa pastille dans un corps, son titre, sa base et les premières propriétés de
// sa mise en page par défaut, lues dans la base à l'affichage. Rien n'est
// écrit dans la page : la valeur montrée est toujours la valeur actuelle.

const PROPRIETES = 4
const DELAI = 350

type Survol = { base: string; id: string; x: number; y: number }

/** Entoure un éditeur : survoler une pastille de ligne montre son aperçu. */
export function SurvolReferences({ children }: { children: ReactNode }) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const annuler = () => {
    if (minuterie.current) clearTimeout(minuterie.current)
    minuterie.current = null
  }
  return (
    <div
      onMouseOver={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.cm-reference')
        const { base, id } = el?.dataset ?? {}
        if (!el || !base || !id || base === DOSSIER_WIKI) return
        if (survol?.id === id && survol.base === base) return
        annuler()
        const r = el.getBoundingClientRect()
        minuterie.current = setTimeout(() => setSurvol({ base, id, x: r.left, y: r.bottom + 6 }), DELAI)
      }}
      onMouseOut={(e) => {
        const vers = e.relatedTarget as HTMLElement | null
        if (vers?.closest?.('.cm-reference') === (e.target as HTMLElement).closest('.cm-reference')) return
        annuler()
        setSurvol(null)
      }}
      onMouseDown={() => {
        annuler()
        setSurvol(null)
      }}
    >
      {children}
      {survol && createPortal(<ApercuLigne {...survol} />, document.body)}
    </div>
  )
}

function ApercuLigne({ base, id, x, y }: Survol) {
  const { etat } = useEspace()
  const eb = etat.bases.get(base)
  const depot = eb?.depot
  const ligne = depot?.lignes().find((l) => l.id === id)
  if (!eb || !depot || !ligne) return null
  const mep = choisirMiseEnPage(eb.pages)
  const proprietes = proprietesVisibles(depot.schema, mep, ligne).visibles.filter((c) => ligne.cellules[c.cle] !== undefined || c.type === 'rollup' || c.type === 'formula').slice(0, PROPRIETES)
  return (
    <div className="apercu-reference" role="tooltip" style={{ left: Math.min(x, window.innerWidth - 300), top: y }}>
      <div className="base-apercu">{depot.schema.nom}</div>
      <strong>{titreDe(etat, base, id)}</strong>
      {proprietes.length > 0 && (
        <dl>
          {proprietes.map((c) => (
            <div key={c.cle}>
              <dt>{c.nom}</dt>
              <dd>
                <ValeurCompacte base={base} ligne={ligne} colonne={c} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
