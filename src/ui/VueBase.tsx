import { useEffect, useMemo, useState } from 'react'
import type { ChargementBase } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace, EtatBase } from '../core/depot-espace'
import { appliquerVue, filtreDePastille, valeursHeritees } from '../core/filtres'
import type { Filtre, ModificationVue } from '../core/vue'
import { useLancer } from './actions'
import { BarreVue } from './BarreVue'
import { Collection } from './Collection'
import { Kanban } from './Kanban'
import { Page } from './Page'
import { Tableau } from './Tableau'
import { useAujourdhui } from './useAujourdhui'
import { useErreurDepot, useLignes } from './useDepot'
import { useEspace } from './contexte-espace'

type Props = { espace: DepotEspace; etat: EtatBase; depot: DepotBase; chargement: Extract<ChargementBase, { ok: true }> }

/** Une base ouverte : sa vue courante, filtrée et triée. */
export function VueBase({ espace, etat, depot, chargement }: Props) {
  const erreur = useErreurDepot(depot)
  const lignesStockees = useLignes(depot)
  const { etat: etatEspace } = useEspace()
  // Chaque ligne avec ses colonnes calculées : filtres, tris et affichage les traitent comme les autres.
  const calculs = etatEspace.calculs.get(etat.id)
  const lignes = useMemo(
    () =>
      lignesStockees.map((l) => {
        const c = calculs?.get(l.id)
        return c ? { ...l, cellules: { ...l.cellules, ...c } } : l
      }),
    [lignesStockees, calculs],
  )
  const aujourdhui = useAujourdhui()
  const lancer = useLancer()
  const [idVue, setIdVue] = useState(etat.vues[0]!.id)
  const vue = etat.vues.find((v) => v.id === idVue) ?? etat.vues[0]!

  // Lignes créées ou modifiées ici : visibles jusqu'au prochain changement de vue ou de filtres (spec §8).
  const cleVue = JSON.stringify([vue.id, vue.filtres, vue.tris, vue.filtresRapides])
  const [persistantes, setPersistantes] = useState<{ cle: string; ids: ReadonlySet<string> }>({ cle: cleVue, ids: new Set() })
  const ids = useMemo(
    () => (persistantes.cle === cleVue ? persistantes.ids : new Set<string>()),
    [persistantes, cleVue],
  )
  const retenir = (id: string) => {
    if (!ids.has(id)) setPersistantes({ cle: cleVue, ids: new Set([...ids, id]) })
  }

  // Filtres de la vue + pastilles réglées, combinés en ET.
  const filtres = useMemo(
    () => [
      ...vue.filtres,
      ...vue.filtresRapides.map((p) => filtreDePastille(depot.schema, p)).filter((f): f is Filtre => f !== null),
    ],
    [vue, depot.schema],
  )
  const lignesVue = useMemo(
    () => appliquerVue(lignes, depot.schema, filtres, vue.tris, { aujourdhui }, ids),
    [lignes, depot.schema, filtres, vue.tris, aujourdhui, ids],
  )

  // Page ouverte (spec §9) : panneau à droite ou plein écran. Elle peut appartenir
  // à une autre base quand on la suit depuis un onglet relation.
  const [page, setPage] = useState<{ base: string; id: string } | null>(null)
  const [pleinEcran, setPleinEcran] = useState(false)

  useEffect(() => {
    if (!page) return
    const clavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement
      const enSaisie = cible.closest('input, textarea, select, [contenteditable="true"]')
      if (e.key === 'Escape') {
        if (document.querySelector('.flottant')) return // le menu ouvert se ferme d'abord
        if (enSaisie) return (cible as HTMLElement).blur()
        setPage(null)
        setPleinEcran(false)
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !enSaisie && page.base === etat.id) {
        const i = lignesVue.findIndex((l) => l.ligne.id === page.id)
        const suivante = lignesVue[i + (e.key === 'ArrowDown' ? 1 : -1)]
        if (i >= 0 && suivante) {
          e.preventDefault()
          setPage({ base: etat.id, id: suivante.ligne.id })
        }
      }
    }
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  }, [page, lignesVue, etat.id])

  const reglages = useMemo(
    () => ({ vue, modifier: (m: ModificationVue) => void lancer(espace.modifierVue(etat.id, vue.id, m)) }),
    [vue, espace, etat.id, lancer],
  )

  const { nonReconnus, avertissements } = chargement.base
  const signalements = [...avertissements, ...nonReconnus.map((f) => `${f.chemin} : ${f.raison}`)]

  return (
    <div className={`zone-vue ${page ? 'avec-page' : ''} ${pleinEcran ? 'page-plein-ecran' : ''}`}>
      <div className="zone-tableau">
        <h1>{depot.schema.nom}</h1>
        {erreur && <p className="erreur">Écriture impossible : {erreur}</p>}
        {signalements.length > 0 && (
          <details className="avertissements">
            <summary>
              ⚠ {signalements.length} signalement{signalements.length > 1 ? 's' : ''}
            </summary>
            <ul>
              {signalements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
        <BarreVue espace={espace} base={etat.id} schema={depot.schema} vues={etat.vues} vue={vue} choisirVue={setIdVue} />
        {vue.type === 'tableau' && (
          <Tableau
            key={vue.id}
            reglages={reglages}
            espace={espace}
            base={etat.id}
            depot={depot}
            lignesVue={lignesVue}
            tris={vue.tris}
            valeursCreation={() => valeursHeritees(depot.schema, filtres)}
            retenir={retenir}
            ouvrir={(l) => setPage({ base: etat.id, id: l.id })}
          />
        )}
        {(vue.type === 'kanban' || vue.type === 'collection') &&
          (() => {
            const Composant = vue.type === 'kanban' ? Kanban : Collection
            return (
              <Composant
                key={vue.id}
                espace={espace}
                base={etat.id}
                depot={depot}
                vue={vue}
                lignesVue={lignesVue}
                valeursCreation={() => valeursHeritees(depot.schema, filtres)}
                retenir={retenir}
                ouvrir={(l) => setPage({ base: etat.id, id: l.id })}
              />
            )
          })()}
        {(vue.type === 'calendrier' || vue.type === 'timeline') && (
          <p className="discret">Les vues calendrier et timeline arrivent au jalon 9.</p>
        )}
      </div>
      {page && (
        <Page
          key={`${page.base}/${page.id}`}
          base={page.base}
          id={page.id}
          miseEnPageDeLaVue={page.base === etat.id ? vue.miseEnPage : undefined}
          vue={{ base: etat.id, id: vue.id, nom: vue.nom }}
          pleinEcran={pleinEcran}
          basculerPleinEcran={() => setPleinEcran(!pleinEcran)}
          fermer={() => {
            setPage(null)
            setPleinEcran(false)
          }}
          ouvrir={(base, id) => setPage({ base, id })}
        />
      )}
    </div>
  )
}
