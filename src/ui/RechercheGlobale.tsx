import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DepotEspace, EtatEspace } from '../core/depot-espace'
import type { Resultat } from '../core/recherche'
import { DOSSIER_WIKI, parentsDe } from '../core/wiki'
import { ArrowDown, ArrowUp, FileText } from 'lucide-react'
import { Icone } from './icones'

type Props = {
  espace: DepotEspace
  etat: EtatEspace
  /** Ouvre la page trouvée dans sa base. */
  ouvrir: (base: string, ligne: string) => void
  fermer: () => void
}

/**
 * Recherche globale (spec §11) : Ctrl+K ou ⌘K, plein texte sur les titres,
 * les champs texte et le corps de toutes les bases. Résultats groupés par
 * base ; Entrée ou un clic ouvre la page.
 */
export function RechercheGlobale({ espace, etat, ouvrir, fermer }: Props) {
  const [requete, setRequete] = useState('')
  const [choisi, setChoisi] = useState(0)
  // Filtre « Wiki seulement » (spec §22), proposé dès que l'espace a des pages.
  const [wikiSeul, setWikiSeul] = useState(false)
  const avecWiki = etat.wiki.pages.length > 0
  const liste = useRef<HTMLDivElement>(null)
  // `etat` en dépendance : l'index suit les modifications faites pendant que la recherche est ouverte.
  const resultats = useMemo(
    () => (wikiSeul && avecWiki ? espace.chercher(requete, 500).filter((r) => r.base === DOSSIER_WIKI).slice(0, 50) : espace.chercher(requete)),
    [espace, requete, etat, wikiSeul, avecWiki],
  )

  // Groupes dans l'ordre du meilleur résultat de chaque base ; la navigation au clavier suit l'affichage.
  const groupes = useMemo(() => {
    const parBase = new Map<string, Resultat[]>()
    for (const r of resultats) parBase.set(r.base, [...(parBase.get(r.base) ?? []), r])
    return [...parBase]
  }, [resultats])
  const aplatis = groupes.flatMap(([, rs]) => rs)
  const actif = Math.min(choisi, aplatis.length - 1)

  useEffect(() => {
    liste.current?.querySelector('.resultat.active')?.scrollIntoView({ block: 'nearest' })
  }, [actif])

  const valider = (r: Resultat | undefined) => {
    if (!r) return
    ouvrir(r.base, r.ligne)
    fermer()
  }
  /** Chemin d'une page dans l'arbre du wiki : ses parents, de la racine au parent direct. */
  const chemin = (id: string) =>
    parentsDe(etat.wiki.pages, id)
      .map((p) => p.titre || 'Sans titre')
      .join(' / ')
  const nomBase = (id: string) => {
    if (id === DOSSIER_WIKI) return 'Wiki'
    const c = etat.bases.get(id)?.chargement
    return c?.ok ? c.base.schema.nom : id
  }

  return createPortal(
    <div className="voile-recherche" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <div className="recherche-globale" role="dialog" aria-label="Recherche globale">
        <input
          className="champ-recherche"
          autoFocus
          placeholder="Chercher dans tout l’espace…"
          value={requete}
          onChange={(e) => {
            setRequete(e.target.value)
            setChoisi(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              fermer()
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (aplatis.length > 0) setChoisi((actif + (e.key === 'ArrowDown' ? 1 : aplatis.length - 1)) % aplatis.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              valider(aplatis[actif])
            }
          }}
        />
        {avecWiki && (
          <div className="filtres-recherche">
            <button
              className={`discret filtre-recherche ${wikiSeul ? 'actif' : ''}`}
              aria-pressed={wikiSeul}
              // Le focus reste dans le champ : Entrée ouvre toujours le résultat choisi.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (setWikiSeul((v) => !v), setChoisi(0))}>
              <Icone de={FileText} />
              Wiki seulement
            </button>
          </div>
        )}
        <div className="resultats-recherche" ref={liste}>
          {requete.trim() !== '' && aplatis.length === 0 && <p className="discret vide-recherche">Aucun résultat</p>}
          {groupes.map(([base, rs]) => (
            <section key={base}>
              <div className="base-resultats discret">{nomBase(base)}</div>
              {rs.map((r) => {
                const i = aplatis.indexOf(r)
                return (
                  <button
                    key={r.ligne}
                    className={`resultat ${i === actif ? 'active' : ''}`}
                    onMouseMove={() => i !== actif && setChoisi(i)}
                    onClick={() => valider(r)}
                  >
                    <span className="titre-resultat">
                      {r.base === DOSSIER_WIKI && chemin(r.ligne) && <span className="chemin-resultat discret">{chemin(r.ligne)} / </span>}
                      {r.titre || 'Sans titre'}
                    </span>
                    {r.extrait && <span className="extrait-resultat discret">{surligner(r.extrait, r.surlignages)}</span>}
                  </button>
                )
              })}
            </section>
          ))}
        </div>
        <div className="pied-recherche discret">
          <span><kbd className="touches"><Icone de={ArrowUp} taille={12} /><Icone de={ArrowDown} taille={12} /></kbd> pour choisir</span>
          <span>Entrée pour ouvrir</span>
          <span>Échap pour fermer</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function surligner(texte: string, plages: [number, number][]): ReactNode[] {
  const morceaux: ReactNode[] = []
  let position = 0
  for (const [d, f] of plages) {
    if (d < position) continue // plages qui se chevauchent : la première suffit
    morceaux.push(texte.slice(position, d), <mark key={d}>{texte.slice(d, f)}</mark>)
    position = f
  }
  morceaux.push(texte.slice(position))
  return morceaux
}
