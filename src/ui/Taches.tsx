import { Fragment, useState } from 'react'
import { ListChecks, Plus, Search, TriangleAlert } from 'lucide-react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { EtatEspace } from '../core/depot-espace'
import type { NiveauContenus, OngletPage } from '../core/mise-en-page'
import { colonne as colonneDe } from '../core/schema'
import { ajouterTache, cocherTache, lireTaches, texteSimple, type Tache } from '../core/taches'
import { ValeurCompacte } from './cellules'
import { useEspace } from './contexte-espace'
import { lignesDuNiveau } from './ContenusLies'
import { Icone } from './icones'
import { DonneesDe, useConsultation } from './mode'
import { useAujourdhui } from './useAujourdhui'

// Tâches (spec §9, « Tâches ») : les cases à cocher du corps des pages,
// rassemblées dans l'onglet Tâches d'une page (avec celles des lignes liées)
// et dans la page « Toutes les tâches ». Cocher réécrit la case dans le corps
// de la ligne, par DepotBase : même regroupement des écritures, même Ctrl+Z.

type Ouvrir = (base: string, id: string) => void

function titreDe(depot: DepotBase, l: LigneChargee): string {
  const t = l.cellules[depot.schema.champTitre]
  return t?.etat === 'ok' && String(t.valeur) !== '' ? String(t.valeur) : 'Sans titre'
}

/** Coche une tâche dans le corps tel qu'il est maintenant (il a pu changer depuis l'affichage). */
function cocher(depot: DepotBase, idLigne: string, tache: Tache, faite: boolean) {
  const actuelle = depot.lignes().find((l) => l.id === idLigne)
  if (!actuelle) return
  const corps = cocherTache(actuelle.corps, tache, faite)
  if (corps !== null) depot.modifierCorps(actuelle.chemin, corps)
}

/** Les cases d'une ligne, sous le titre de leur section. À placer dans le `DonneesDe` de sa base. */
function ListeTaches(p: { depot: DepotBase; ligne: LigneChargee; taches: Tache[]; apresCoche?: (t: Tache) => void }) {
  const lecture = useConsultation()
  let section: string | undefined
  return (
    <ul className="liste-taches">
      {p.taches.map((t) => {
        const nouvelleSection = t.section !== section && t.section !== undefined ? t.section : undefined
        section = t.section
        return (
          <Fragment key={t.ligne}>
            {nouvelleSection && <li className="section-taches">{nouvelleSection}</li>}
            <li className={`tache ${t.faite ? 'faite' : ''}`} style={t.niveau > 0 ? { paddingLeft: `${t.niveau * 1.4}em` } : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={t.faite}
                  disabled={lecture}
                  onChange={(e) => {
                    cocher(p.depot, p.ligne.id, t, e.target.checked)
                    p.apresCoche?.(t)
                  }}
                />
                <span>{texteSimple(t.texte) || <span className="discret">Sans texte</span>}</span>
              </label>
            </li>
          </Fragment>
        )
      })}
    </ul>
  )
}

/** Tâches d'une ligne et de ses lignes liées, niveau par niveau : `restantes` sur `total`. */
export function compterTaches(etat: EtatEspace, base: string, ligne: LigneChargee, niveau: NiveauContenus | undefined, chemin: readonly string[], aujourdhui: string) {
  const propres = lireTaches(ligne.corps)
  let total = propres.length
  let restantes = propres.filter((t) => !t.faite).length
  const n = niveau && lignesDuNiveau(etat, base, ligne, niveau, chemin, aujourdhui)
  if (n) {
    for (const l of n.lignes) {
      const c = compterTaches(etat, n.cible.id, l, niveau.puis, [...chemin, `${n.cible.id}/${l.id}`], aujourdhui)
      total += c.total
      restantes += c.restantes
    }
  }
  return { total, restantes }
}

/** Onglet Tâches d'une page : ses cases, une saisie pour en ajouter, puis celles des lignes liées. */
export function OngletTaches(p: { base: string; depot: DepotBase; ligne: LigneChargee; onglet: Extract<OngletPage, { type: 'taches' }>; ouvrir: Ouvrir }) {
  const lecture = useConsultation()
  const taches = lireTaches(p.ligne.corps)
  return (
    <div className="onglet-taches">
      {taches.length > 0 ? (
        <ListeTaches depot={p.depot} ligne={p.ligne} taches={taches} />
      ) : (
        <p className="discret vide-contenus">Aucune case à cocher dans le contenu de cette page.</p>
      )}
      {!lecture && <NouvelleTache depot={p.depot} idLigne={p.ligne.id} />}
      {p.onglet.liees && <TachesLiees base={p.base} ligne={p.ligne} niveau={p.onglet.liees} chemin={[`${p.base}/${p.ligne.id}`]} ouvrir={p.ouvrir} premier />}
    </div>
  )
}

/** « Ajouter une tâche » : `- [ ] texte` sous la dernière tâche du corps. */
function NouvelleTache(p: { depot: DepotBase; idLigne: string }) {
  const [texte, setTexte] = useState('')
  const ajouter = () => {
    const actuelle = p.depot.lignes().find((l) => l.id === p.idLigne)
    if (!actuelle || texte.trim() === '') return
    p.depot.modifierCorps(actuelle.chemin, ajouterTache(actuelle.corps, texte))
    setTexte('')
  }
  return (
    <label className="nouvelle-tache">
      <Icone de={Plus} />
      <input
        value={texte}
        placeholder="Ajouter une tâche"
        aria-label="Ajouter une tâche"
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ajouter()
          }
        }}
      />
    </label>
  )
}

/** Tâches des lignes liées d'un niveau ; une ligne sans tâche (ni plus bas) n'apparaît pas. */
function TachesLiees(p: { base: string; ligne: LigneChargee; niveau: NiveauContenus; chemin: readonly string[]; ouvrir: Ouvrir; premier?: boolean }) {
  const { etat } = useEspace()
  const aujourdhui = useAujourdhui()
  const n = lignesDuNiveau(etat, p.base, p.ligne, p.niveau, p.chemin, aujourdhui)
  if (!n) {
    return (
      <p className="invalide">
        <Icone de={TriangleAlert} className="alerte" />
        Tâches liées : relation « {p.niveau.relation} » introuvable
      </p>
    )
  }
  const { relation, cible, depot } = n
  const blocs = n.lignes.flatMap((l) => {
    const chemin = [...p.chemin, `${cible.id}/${l.id}`]
    const compte = compterTaches(etat, cible.id, l, p.niveau.puis, chemin, aujourdhui)
    return compte.total > 0 ? [{ l, chemin, compte }] : []
  })
  if (blocs.length === 0) return p.premier ? <p className="discret vide-contenus">Aucune tâche dans {relation.nom}.</p> : null
  const champs = p.niveau.champs.flatMap((k) => colonneDe(depot.schema, k) ?? [])
  return (
    <section className="taches-liees">
      <div className="titre-contenus">{relation.nom}</div>
      {blocs.map(({ l, chemin, compte }) => (
        <div key={l.id} className="bloc-taches">
          <div className="entete-contenu">
            <button className="titre-contenu" onClick={() => p.ouvrir(cible.id, l.id)} title="Ouvrir la page">
              {titreDe(depot, l)}
            </button>
            {champs.map((c) => (
              <span key={c.cle} className="champ-carte">
                <ValeurCompacte base={cible.id} ligne={l} colonne={c} />
              </span>
            ))}
            <span className="compte-taches">{compte.total - compte.restantes}/{compte.total}</span>
          </div>
          <div className="detail-taches">
            <DonneesDe schema={depot.schema}>
              <ListeTaches depot={depot} ligne={l} taches={lireTaches(l.corps)} />
            </DonneesDe>
            {p.niveau.puis && <TachesLiees base={cible.id} ligne={l} niveau={p.niveau.puis} chemin={chemin} ouvrir={p.ouvrir} />}
          </div>
        </div>
      ))}
    </section>
  )
}

/** Recherche sans casse ni accents. */
const normaliser = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * « Toutes les tâches » : les cases de toutes les pages de l'espace, par base
 * puis par ligne. Une tâche cochée ici reste affichée jusqu'au départ de la
 * page, même si le filtre « À faire » la cacherait : elle ne fuit pas sous le clic.
 */
export function ToutesLesTaches({ ouvrir }: { ouvrir: Ouvrir }) {
  const { etat } = useEspace()
  const [toutes, setToutes] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [gardees, setGardees] = useState<ReadonlySet<string>>(new Set())
  const cherche = normaliser(recherche.trim())
  const ordre = [...etat.groupes.flatMap((g) => g.bases), ...etat.horsGroupe]
  let restantes = 0
  let total = 0

  const bases = ordre.flatMap((id) => {
    const depot = etat.bases.get(id)?.depot
    if (!depot) return []
    const lignes = depot.lignes().flatMap((l) => {
      const taches = lireTaches(l.corps)
      restantes += taches.filter((t) => !t.faite).length
      total += taches.length
      const titre = titreDe(depot, l)
      const titreTrouve = cherche !== '' && normaliser(titre).includes(cherche)
      const visibles = taches.filter(
        (t) => (toutes || !t.faite || gardees.has(`${id}/${l.id}/${t.ligne}`)) && (cherche === '' || titreTrouve || normaliser(texteSimple(t.texte)).includes(cherche)),
      )
      return visibles.length > 0 ? [{ l, titre, visibles, faites: taches.filter((t) => t.faite).length, total: taches.length }] : []
    })
    return lignes.length > 0 ? [{ id, depot, lignes }] : []
  })

  return (
    <div className="toutes-taches">
      <h1>Toutes les tâches</h1>
      <div className="barre-taches">
        <div className="onglets">
          <div className={`onglet ${toutes ? '' : 'actif'}`} onClick={() => setToutes(false)} role="button" aria-pressed={!toutes}>
            À faire <span className="discret">{restantes}</span>
          </div>
          <div className={`onglet ${toutes ? 'actif' : ''}`} onClick={() => setToutes(true)} role="button" aria-pressed={toutes}>
            Toutes
          </div>
        </div>
        <label className="recherche-taches">
          <Icone de={Search} />
          <input value={recherche} placeholder="Chercher une tâche ou une page" aria-label="Chercher une tâche" onChange={(e) => setRecherche(e.target.value)} />
        </label>
      </div>
      {bases.length === 0 && (
        <p className="discret vide-taches">
          <Icone de={ListChecks} />
          {cherche !== ''
            ? 'Aucune tâche ne correspond.'
            : total === 0
              ? 'Aucune case à cocher dans les pages de l’espace. Tape « / » puis Tâche dans le contenu d’une page.'
              : 'Rien à faire : toutes les tâches sont cochées.'}
        </p>
      )}
      {bases.map(({ id, depot, lignes }) => (
        <section key={id} className="taches-base">
          <h2>{depot.schema.nom}</h2>
          <DonneesDe schema={depot.schema}>
            {lignes.map(({ l, titre, visibles, faites, total }) => (
              <div key={l.id} className="bloc-taches">
                <div className="entete-contenu">
                  <button className="titre-contenu" onClick={() => ouvrir(id, l.id)} title="Ouvrir la page">
                    {titre}
                  </button>
                  <span className="compte-taches">
                    {faites}/{total}
                  </span>
                </div>
                <div className="detail-taches">
                  <ListeTaches depot={depot} ligne={l} taches={visibles} apresCoche={(t) => setGardees((g) => new Set([...g, `${id}/${l.id}/${t.ligne}`]))} />
                </div>
              </div>
            ))}
          </DonneesDe>
        </section>
      ))}
    </div>
  )
}
