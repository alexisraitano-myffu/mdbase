import { useState } from 'react'
import type { LigneChargee } from '../core/base'
import { PROFONDEUR_CONTENUS, type NiveauContenus } from '../core/mise-en-page'
import { appliquerVue } from '../core/filtres'
import { colonne as colonneDe, type ColonneRelation, type Schema } from '../core/schema'
import { EditeurTris } from './BarreVue'
import { EditeurFiltres } from './EditeurFiltres'
import { useAujourdhui } from './useAujourdhui'
import { ValeurCompacte } from './cellules'
import { Choix } from './Choix'
import { useEspace } from './contexte-espace'
import { Corps } from './Corps'
import { Icone, ICONES } from './icones'
import { useConsultation } from './mode'
import { Reglage, Visibilite } from './reglages'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, TriangleAlert } from 'lucide-react'

type Ouvrir = (base: string, id: string) => void

/**
 * Contenus liés (spec §9) : sous le corps de la page, les lignes d'une
 * relation, chacune dépliable sur son corps (édité sur place, écrit dans son
 * propre fichier), puis le niveau suivant. `chemin` liste les lignes déjà
 * affichées au-dessus (`base/id`) : une ligne n'y réapparaît jamais.
 */
export function ContenusLies(p: { base: string; ligne: LigneChargee; niveau: NiveauContenus; chemin: readonly string[]; ouvrir: Ouvrir }) {
  const { etat } = useEspace()
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set())
  const aujourdhui = useAujourdhui()
  const schema = etat.bases.get(p.base)?.depot?.schema
  const relation = schema ? colonneDe(schema, p.niveau.relation) : undefined
  const cible = relation?.type === 'relation' ? etat.bases.get(relation.cible) : undefined
  const depot = cible?.depot
  if (relation?.type !== 'relation' || !cible || !depot) {
    return (
      <p className="invalide">
        <Icone de={TriangleAlert} className="alerte" />
        Contenus liés : relation « {p.niveau.relation} » introuvable
      </p>
    )
  }

  const parId = new Map(depot.lignes().map((l) => [l.id, l]))
  const calculs = etat.calculs.get(cible.id)
  const liees = idsLies(p.ligne, relation).flatMap((id) => {
    const l = parId.get(id)
    if (!l || p.chemin.includes(`${cible.id}/${id}`)) return []
    const c = calculs?.get(id)
    return [c ? { ...l, cellules: { ...l.cellules, ...c } } : l]
  })
  // Sans tri, l'ordre de la relation est gardé (le tri est stable).
  const lignes = appliquerVue(liees, depot.schema, p.niveau.filtres ?? [], p.niveau.tris ?? [], { aujourdhui }).map((v) => v.ligne)
  const masquees = liees.length - lignes.length
  const champs = p.niveau.champs.flatMap((k) => colonneDe(depot.schema, k) ?? [])
  const tousOuverts = lignes.length > 0 && lignes.every((l) => ouverts.has(l.id))
  const basculer = (id: string) => setOuverts((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])))

  return (
    <section className="contenus-lies">
      <div className="titre-contenus">
        <span>{relation.nom}</span>
        <span className="discret" title={masquees > 0 ? `${masquees} masquée${masquees > 1 ? 's' : ''} par le filtre` : undefined}>
          {masquees > 0 ? `${lignes.length} sur ${liees.length}` : lignes.length}
        </span>
        {lignes.length > 1 && (
          <button
            className="discret"
            onClick={() => setOuverts(tousOuverts ? new Set() : new Set(lignes.map((l) => l.id)))}
            aria-label={tousOuverts ? `Tout replier : ${relation.nom}` : `Tout déplier : ${relation.nom}`}
            title={tousOuverts ? 'Tout replier' : 'Tout déplier'}
          >
            <Icone de={tousOuverts ? ChevronsDownUp : ChevronsUpDown} />
          </button>
        )}
      </div>
      {lignes.length === 0 && <div className="discret vide-contenus">{masquees > 0 ? 'Aucune ligne liée ne passe le filtre' : 'Aucune ligne liée'}</div>}
      {lignes.map((l) => {
        const t = l.cellules[depot.schema.champTitre]
        const titre = t?.etat === 'ok' && String(t.valeur) !== '' ? String(t.valeur) : 'Sans titre'
        const ouvert = ouverts.has(l.id)
        return (
          <div key={l.id} className={`bloc-contenu ${ouvert ? 'ouvert' : ''}`}>
            <div className="entete-contenu">
              <button className="discret chevron-contenu" onClick={() => basculer(l.id)} aria-expanded={ouvert} aria-label={`${ouvert ? 'Replier' : 'Déplier'} ${titre}`}>
                <Icone de={ChevronRight} taille={14} className={`pli ${ouvert ? 'ouvert' : ''}`} />
              </button>
              <button className="titre-contenu" onClick={() => p.ouvrir(cible.id, l.id)} title="Ouvrir la page">
                {titre}
              </button>
              {champs.map((c) => (
                <span key={c.cle} className="champ-carte">
                  <ValeurCompacte base={cible.id} ligne={l} colonne={c} />
                </span>
              ))}
              {l.corps.trim() === '' && <span className="marque-vide">vide</span>}
            </div>
            {ouvert && (
              <div className="detail-contenu">
                <CorpsLie depot={depot} ligne={l} />
                {p.niveau.puis && <ContenusLies base={cible.id} ligne={l} niveau={p.niveau.puis} chemin={[...p.chemin, `${cible.id}/${l.id}`]} ouvrir={p.ouvrir} />}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function CorpsLie(p: Parameters<typeof Corps>[0]) {
  const lecture = useConsultation()
  if (lecture && p.ligne.corps.trim() === '') return <div className="discret vide-contenus">Pas de contenu</div>
  return <Corps {...p} />
}

/** Ids liés par la relation : stockés (propriétaire) ou calculés, déjà fusionnés dans les cellules de la ligne. */
function idsLies(ligne: LigneChargee, relation: ColonneRelation): string[] {
  const c = ligne.cellules[relation.cle]
  if (c?.etat !== 'ok') return []
  return Array.isArray(c.valeur) ? c.valeur.map(String) : typeof c.valeur === 'string' && c.valeur !== '' ? [c.valeur] : []
}

/**
 * Réglage des contenus liés dans la mise en page : la relation de chaque
 * niveau, ses champs, puis le niveau suivant dans la base liée.
 */
export function ReglageContenus(p: { schema: Schema; niveau: NiveauContenus; changer: (n: NiveauContenus) => void; profondeur?: number }) {
  const { etat } = useEspace()
  const profondeur = p.profondeur ?? 1
  const relations = p.schema.colonnes.filter((c): c is ColonneRelation => c.type === 'relation')
  const relation = relations.find((c) => c.cle === p.niveau.relation)
  const schemaCible = relation ? etat.bases.get(relation.cible)?.depot?.schema : undefined
  const choisis = new Set(p.niveau.champs)
  // Le niveau suivant ne revient pas vers la base d'où l'on vient (la relation inverse).
  const suivantes = schemaCible?.colonnes.filter((c): c is ColonneRelation => c.type === 'relation' && !(relation && c.cle === relation.inverse)) ?? []
  return (
    <div className="niveau-contenus">
      {/* Aux niveaux suivants, la relation se choisit dans « Puis » du niveau au-dessus. */}
      {profondeur === 1 && (
        <Reglage libelle="Lignes liées par">
          <Choix
            valeur={p.niveau.relation}
            entrees={relations.map((c) => ({ valeur: c.cle, libelle: c.nom }))}
            libelle="Lignes liées par"
            changer={(v) => p.changer({ relation: v, champs: [] })}
          />
        </Reglage>
      )}
      {schemaCible && (
        <details className="filtres-niveau">
          <summary>
            <Icone de={ChevronRight} className="chevron-details" taille={14} />
            Champs à côté du titre{p.niveau.champs.length > 0 && ` (${p.niveau.champs.length})`}
          </summary>
          {schemaCible.colonnes
            .filter((c) => c.cle !== schemaCible.champTitre)
            .map((c) => (
              <Visibilite
                key={c.cle}
                libelle={c.nom}
                icone={ICONES[c.type]}
                visible={choisis.has(c.cle)}
                // Dans l'ordre du schéma.
                changer={(v) => p.changer({ ...p.niveau, champs: schemaCible.colonnes.filter((x) => (x.cle === c.cle ? v : choisis.has(x.cle))).map((x) => x.cle) })}
              />
            ))}
        </details>
      )}
      {schemaCible && (
        <>
          <details className="filtres-niveau" open={(p.niveau.filtres?.length ?? 0) > 0 || undefined}>
            <summary>
              <Icone de={ChevronRight} className="chevron-details" taille={14} />
              Filtrer les lignes de {schemaCible.nom}
              {(p.niveau.filtres?.length ?? 0) > 0 && ` (${p.niveau.filtres!.length})`}
            </summary>
            <EditeurFiltres schema={schemaCible} filtres={p.niveau.filtres ?? []} changer={(filtres) => p.changer(avec(p.niveau, { filtres }))} />
          </details>
          <details className="filtres-niveau" open={(p.niveau.tris?.length ?? 0) > 0 || undefined}>
            <summary>
              <Icone de={ChevronRight} className="chevron-details" taille={14} />
              Trier{(p.niveau.tris?.length ?? 0) > 0 && ` (${p.niveau.tris!.length})`}
            </summary>
            <EditeurTris schema={schemaCible} tris={p.niveau.tris ?? []} sansTri="Aucun tri : ordre de la relation" changer={(tris) => p.changer(avec(p.niveau, { tris }))} />
          </details>
        </>
      )}
      {schemaCible && profondeur < PROFONDEUR_CONTENUS && suivantes.length > 0 && (
        <>
          <Reglage libelle={`Puis, dans ${relation!.nom}`}>
            <Choix
              valeur={p.niveau.puis?.relation ?? ''}
              entrees={[{ valeur: '', libelle: 'Rien' }, ...suivantes.map((c) => ({ valeur: c.cle, libelle: c.nom }))]}
              libelle={`Puis, dans ${relation!.nom}`}
              changer={(v) => {
                const { puis: _, ...reste } = p.niveau
                p.changer(v ? { ...reste, puis: { relation: v, champs: [] } } : reste)
              }}
            />
          </Reglage>
          {p.niveau.puis && <ReglageContenus schema={schemaCible} niveau={p.niveau.puis} changer={(n) => p.changer({ ...p.niveau, puis: n })} profondeur={profondeur + 1} />}
        </>
      )}
    </div>
  )
}

/** Niveau avec des filtres ou des tris remplacés ; une liste vide retire la clé. */
function avec(n: NiveauContenus, m: Pick<NiveauContenus, 'filtres'> | Pick<NiveauContenus, 'tris'>): NiveauContenus {
  const suivant = { ...n, ...m }
  if (suivant.filtres?.length === 0) delete suivant.filtres
  if (suivant.tris?.length === 0) delete suivant.tris
  return suivant
}
