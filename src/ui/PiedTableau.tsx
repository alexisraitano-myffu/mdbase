import { useRef, useState } from 'react'
import type { LigneChargee } from '../core/base'
import { agreger, calculsPour } from '../core/calcul'
import { natureDe, type Calcul, type Colonne } from '../core/schema'
import type { Cellule } from '../core/valeurs'
import { LIBELLES_CALCULS } from './EnteteColonne'
import { Flottant } from './flottant'
import { Check, ChevronDown } from 'lucide-react'
import { Icone } from './icones'

// Calculs en pied de colonne (spec §7), sur les lignes affichées : les mêmes
// calculs que les rollups, sauf « afficher », qui n'a pas de sens en pied.

type Props = {
  colonnes: { colonne: Colonne; largeur: number }[]
  lignes: readonly LigneChargee[]
  calculs: Record<string, string>
  /** Absent : pied en lecture seule (pied de groupe). */
  changer?: (cle: string, calcul: Calcul | undefined) => void
}

export function PiedTableau({ colonnes, lignes, calculs, changer }: Props) {
  return (
    <div className={`pied ${changer ? '' : 'pied-groupe'}`}>
      {colonnes.map(({ colonne, largeur }) => (
        <CaseCalcul key={colonne.cle} colonne={colonne} largeur={largeur} lignes={lignes} calcul={calculs[colonne.cle]} changer={changer} />
      ))}
    </div>
  )
}

function CaseCalcul(p: { colonne: Colonne; largeur: number; lignes: readonly LigneChargee[]; calcul: string | undefined; changer: Props['changer'] }) {
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLDivElement>(null)
  const { colonne, calcul } = p
  const resultat = calcul ? agreger(calcul, colonne, p.lignes.map((l) => l.cellules[colonne.cle])) : undefined
  const choix = calculsPour(colonne).filter((c) => c !== 'afficher')

  return (
    <div
      ref={ancre}
      className={`case-calcul ${calcul ? 'avec-calcul' : ''} ${p.changer ? 'modifiable' : ''}`}
      style={{ width: p.largeur }}
      onClick={() => p.changer && setOuvert(true)}
    >
      {calcul ? (
        <>
          <span className="libelle-calcul">{LIBELLES_CALCULS[calcul as Calcul] ?? calcul}</span> {formater(calcul, colonne, resultat)}
        </>
      ) : (
        p.changer && <span className="invite-calcul">Calculer <Icone de={ChevronDown} taille={12} /></span>
      )}
      {ouvert && p.changer && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <button className="option discret" onClick={() => (setOuvert(false), p.changer!(colonne.cle, undefined))}>
            Aucun
          </button>
          {choix.map((c) => (
            <button key={c} className="option" onClick={() => (setOuvert(false), p.changer!(colonne.cle, c))}>
              <span className="coche">{c === calcul && <Icone de={Check} taille={14} />}</span>
              {LIBELLES_CALCULS[c]}
            </button>
          ))}
        </Flottant>
      )}
    </div>
  )
}

function formater(calcul: string, colonne: Colonne, c: Cellule | undefined): string {
  if (!c) return '—'
  if (c.etat === 'invalide') return '⚠'
  const v = c.valeur
  if (typeof v === 'number') {
    const n = v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
    return calcul.startsWith('pourcent') ? `${n} %` : n
  }
  if ((calcul === 'date_plus_tot' || calcul === 'date_plus_tard') && typeof v === 'string') {
    const [date, heure] = v.split('T')
    return `${date!.split('-').reverse().join('/')}${heure ? ` ${heure}` : ''}`
  }
  return natureDe(colonne) === 'liste' && Array.isArray(v) ? v.join(', ') : String(v)
}
