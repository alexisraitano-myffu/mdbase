import type { LigneChargee } from '../core/base'
import type { Colonne, Schema } from '../core/schema'
import { ValeurCompacte } from './cellules'

type Props = {
  base: string
  schema: Schema
  ligne: LigneChargee
  /** Champs affichés sous le titre (spec §7, `champs_carte`). */
  champs: Colonne[]
  apercuCorps?: boolean
  sortira?: boolean
  ouvrir: () => void
}

/** Carte d'une ligne : titre, champs choisis, et en option le début du corps. */
export function Carte({ base, schema, ligne, champs, apercuCorps, sortira, ouvrir }: Props) {
  const t = ligne.cellules[schema.champTitre]
  const titre = t?.etat === 'ok' && String(t.valeur) !== '' ? String(t.valeur) : 'Sans titre'
  const apercu = apercuCorps ? debutDuCorps(ligne.corps) : ''
  return (
    <div
      className={`carte ${sortira ? 'sortira' : ''}`}
      onClick={ouvrir}
      title={sortira ? 'Sortira de la vue au prochain rafraîchissement' : undefined}
    >
      <div className={`titre-carte ${titre === 'Sans titre' ? 'discret' : ''}`}>{titre}</div>
      {champs.map((c) => (
        <div key={c.cle} className="champ-carte">
          <ValeurCompacte base={base} ligne={ligne} colonne={c} />
        </div>
      ))}
      {apercu && <div className="apercu-corps">{apercu}</div>}
    </div>
  )
}

/** Premières lignes du corps, sans la syntaxe Markdown la plus visible. */
function debutDuCorps(corps: string): string {
  return corps
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ x]\]\s+)?|>\s?|\d+\.\s+)/, '').replace(/[*_`~]/g, '').trim())
    .filter((l) => l !== '')
    .slice(0, 3)
    .join(' · ')
}
