import { Fragment, useRef, useState } from 'react'
import { ListChecks, Plus, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import type { LigneChargee } from '../core/base'
import { echeanceDe, estFaite, lignesTaches, resoudreBaseTaches, tachesLiees, trierTaches, valeurFait, type BaseTaches, type ResolutionTaches } from '../core/base-taches'
import type { DepotBase } from '../core/depot-base'
import type { EtatEspace } from '../core/depot-espace'
import type { ConfigTaches } from '../core/espace-config'
import type { NiveauContenus, OngletPage } from '../core/mise-en-page'
import { colonne as colonneDe, type Schema } from '../core/schema'
import { ajouterTache, cocherTache, lireTaches, texteSimple, type Tache } from '../core/taches'
import { useLancer } from './actions'
import { ValeurCompacte } from './cellules'
import { Choix } from './Choix'
import { useEspace } from './contexte-espace'
import { entreesColonnes } from './EditeurFiltres'
import { Flottant } from './flottant'
import { lignesDuNiveau } from './ContenusLies'
import { Icone } from './icones'
import { DonneesDe, useConsultation, useModeConsultation } from './mode'
import { Interrupteur, Reglage, Section } from './reglages'
import { useAujourdhui } from './useAujourdhui'

// Tâches (spec §9, « Tâches » et « Base des tâches ») : les cases à cocher du
// corps des pages, et les lignes de la base des tâches si l'espace en désigne
// une, rassemblées dans l'onglet Tâches d'une page (avec celles des lignes
// liées) et dans la page « Toutes les tâches ». Cocher réécrit la case dans le
// corps, ou le champ « fait » de la ligne, par DepotBase : même regroupement
// des écritures, même Ctrl+Z.

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

/** La base des tâches de l'espace, résolue : `null` sans clé `taches`. */
export function useBaseTaches(): ResolutionTaches | null {
  const { etat } = useEspace()
  return resoudreBaseTaches(etat, etat.taches)
}

/** Lignes de la base des tâches et leurs cases : `restantes` sur `total`. */
function compterLignes(t: BaseTaches, lignes: readonly LigneChargee[]) {
  let total = 0
  let restantes = 0
  for (const l of lignes) {
    const sous = lireTaches(l.corps)
    total += 1 + sous.length
    restantes += (estFaite(t, l) ? 0 : 1) + sous.filter((x) => !x.faite).length
  }
  return { total, restantes }
}

/**
 * Les tâches liées par la mise en page, sauf quand elles mènent à la base des
 * tâches : ses lignes sont déjà là, avec leurs cases, on les verrait deux fois.
 */
function lieesSansDoublon(etat: EtatEspace, base: string, niveau: NiveauContenus | undefined, t: BaseTaches | null): NiveauContenus | undefined {
  if (!niveau || !t) return niveau
  const schema = etat.bases.get(base)?.depot?.schema
  const relation = schema && colonneDe(schema, niveau.relation)
  return relation?.type === 'relation' && relation.cible === t.base ? undefined : niveau
}

/** Tâches restantes d'une page : ses cases, celles des lignes liées, et les lignes de la base des tâches liées à elle. */
export function restantesDeLaPage(etat: EtatEspace, base: string, ligne: LigneChargee, onglet: Extract<OngletPage, { type: 'taches' }>, aujourdhui: string): number {
  const r = resoudreBaseTaches(etat, etat.taches)
  const t = r?.ok ? r.taches : null
  const { restantes } = compterTaches(etat, base, ligne, lieesSansDoublon(etat, base, onglet.liees, t), [`${base}/${ligne.id}`], aujourdhui)
  const liees = t && tachesLiees(etat, t, base, ligne.id)
  return restantes + (liees ? compterLignes(t, liees.lignes).restantes : 0)
}

/**
 * Onglet Tâches d'une page : les lignes de la base des tâches liées à elle
 * s'il y en a une, ses cases, une saisie pour en ajouter, puis celles des lignes liées.
 */
export function OngletTaches(p: { base: string; depot: DepotBase; ligne: LigneChargee; onglet: Extract<OngletPage, { type: 'taches' }>; ouvrir: Ouvrir }) {
  const { etat, espace } = useEspace()
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const r = useBaseTaches()
  const t = r?.ok ? r.taches : null
  const liees = t && tachesLiees(etat, t, p.base, p.ligne.id)
  const taches = lireTaches(p.ligne.corps)
  const niveau = lieesSansDoublon(etat, p.base, p.onglet.liees, t)
  return (
    <div className="onglet-taches">
      {t && liees && (
        <section className="taches-liees">
          <div className="titre-contenus">{t.depot.schema.nom}</div>
          <DonneesDe schema={t.depot.schema}>
            {liees.lignes.length > 0 ? (
              <ListeLignesTaches t={t} lignes={liees.lignes} ouvrir={p.ouvrir} aujourdhui={aujourdhui} />
            ) : (
              <p className="discret vide-contenus">Aucune tâche liée à cette page.</p>
            )}
            <SaisieTache ajouter={(texte) => void lancer(espace.creerLigne(t.base, { [t.depot.schema.champTitre]: texte, [liees.relation.cle]: [p.ligne.id] }))} />
          </DonneesDe>
        </section>
      )}
      {liees && <div className="titre-contenus">Dans le texte</div>}
      {taches.length > 0 ? (
        <ListeTaches depot={p.depot} ligne={p.ligne} taches={taches} />
      ) : (
        <p className="discret vide-contenus">Aucune case à cocher dans le contenu de cette page.</p>
      )}
      <SaisieTache
        ajouter={(texte) => {
          const actuelle = p.depot.lignes().find((l) => l.id === p.ligne.id)
          if (actuelle) p.depot.modifierCorps(actuelle.chemin, ajouterTache(actuelle.corps, texte))
        }}
      />
      {niveau && <TachesLiees base={p.base} ligne={p.ligne} niveau={niveau} chemin={[`${p.base}/${p.ligne.id}`]} ouvrir={p.ouvrir} premier />}
    </div>
  )
}

/** « Ajouter une tâche » : rien en consultation ni dans une base synchronisée. */
function SaisieTache(p: { ajouter: (texte: string) => void }) {
  const lecture = useConsultation()
  const [texte, setTexte] = useState('')
  if (lecture) return null
  return (
    <label className="nouvelle-tache">
      <Icone de={Plus} />
      <input
        value={texte}
        placeholder="Ajouter une tâche"
        aria-label="Ajouter une tâche"
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && texte.trim() !== '') {
            e.preventDefault()
            p.ajouter(texte.trim())
            setTexte('')
          }
        }}
      />
    </label>
  )
}

/** Lignes de la base des tâches, chacune avec sa case, son titre, son échéance, et les cases de son corps dessous. */
function ListeLignesTaches(p: {
  t: BaseTaches
  lignes: readonly { l: LigneChargee; sous?: Tache[] }[] | readonly LigneChargee[]
  ouvrir: Ouvrir
  aujourdhui: string
  apresCoche?: (cle: string) => void
}) {
  const lecture = useConsultation()
  const { t } = p
  return (
    <ul className="liste-taches lignes-taches">
      {p.lignes.map((x) => {
        const { l, sous } = 'l' in x ? x : { l: x, sous: undefined }
        const faite = estFaite(t, l)
        const echeance = echeanceDe(t, l)
        const cases = sous ?? lireTaches(l.corps)
        const titre = titreDe(t.depot, l)
        return (
          <li key={l.id} className={`tache tache-ligne ${faite ? 'faite' : ''}`}>
            <div className="entete-tache">
              <input
                type="checkbox"
                checked={faite}
                disabled={lecture}
                aria-label={`Fait : ${titre}`}
                onChange={(e) => {
                  t.depot.modifier(l.chemin, t.fait.cle, valeurFait(t, e.target.checked))
                  p.apresCoche?.(`${t.base}/${l.id}`)
                }}
              />
              <button className="titre-tache" onClick={() => p.ouvrir(t.base, l.id)} title="Ouvrir la page">
                {titre}
              </button>
              {echeance && t.echeance && (
                <span className={`echeance-tache ${!faite && echeance < p.aujourdhui ? 'en-retard' : ''}`}>
                  <ValeurCompacte base={t.base} ligne={l} colonne={t.echeance} />
                </span>
              )}
            </div>
            {cases.length > 0 && (
              <div className="detail-taches">
                <ListeTaches depot={t.depot} ligne={l} taches={cases} apresCoche={(c) => p.apresCoche?.(`${t.base}/${l.id}/${c.ligne}`)} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Options de « Toutes les tâches » : la base des tâches et ses colonnes, ou sa création. */
function OptionsTaches() {
  const { etat, espace } = useEspace()
  const lancer = useLancer()
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  const config = etat.taches
  const schema = config ? etat.bases.get(config.base)?.depot?.schema : undefined
  const r = resoudreBaseTaches(etat, config)
  const regler = (c: ConfigTaches | null) => void lancer(espace.reglerTaches(c))
  const faits = (s: Schema) => s.colonnes.filter((c) => c.type === 'checkbox' || c.type === 'select')
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot ? [b.depot.schema] : []))
  const choisirBase = (id: string) => {
    const s = bases.find((b) => b.id === id)
    const fait = s && (faits(s).find((c) => c.type === 'checkbox') ?? faits(s)[0])
    if (!s || !fait) return regler(null)
    // Une date nommée échéance d'abord (« Début » vient souvent avant elle), sinon la première.
    const dates = s.colonnes.filter((c) => c.type === 'date')
    const echeance = dates.find((c) => /ch[ée]ance|due/i.test(`${c.cle} ${c.nom}`)) ?? dates[0]
    regler({ base: id, fait: fait.cle, ...(echeance && { echeance: echeance.cle }) })
  }
  const fait = schema && config ? colonneDe(schema, config.fait) : undefined
  return (
    <>
      <button ref={ancre} className={`discret outil ${config ? 'actif' : ''}`} onClick={() => setOuvert(true)}>
        <Icone de={SlidersHorizontal} />
        Options
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau">
            <Section titre="Base des tâches" aide="Chaque ligne de cette base est une tâche, en plus des cases à cocher des textes.">
              <Reglage libelle="Base">
                <Choix
                  valeur={config?.base ?? ''}
                  libelle="Base des tâches"
                  inconnue={config?.base}
                  entrees={[
                    { valeur: '', libelle: 'Aucune' },
                    ...bases.map((s) => ({ valeur: s.id, libelle: s.nom, desactivee: faits(s).length === 0 })),
                  ]}
                  changer={choisirBase}
                />
              </Reglage>
              {config && schema && (
                <>
                  <Reglage libelle="Fait">
                    <Choix valeur={config.fait} libelle="Colonne fait" entrees={entreesColonnes(faits(schema))} changer={(v) => regler({ base: config.base, fait: v, ...(config.echeance && { echeance: config.echeance }) })} />
                  </Reglage>
                  {fait?.type === 'select' &&
                    r?.ok &&
                    fait.options.map((o) => {
                      const coche = r.taches.terminees.includes(o.label)
                      return (
                        <Interrupteur
                          key={o.label}
                          libelle={`« ${o.label} » compte comme fait`}
                          coche={coche}
                          desactive={coche && r.taches.terminees.length === 1}
                          changer={(v) => regler({ ...config, terminees: fait.options.map((x) => x.label).filter((x) => (x === o.label ? v : r.taches.terminees.includes(x))) })}
                        />
                      )
                    })}
                  <Reglage libelle="Échéance">
                    <Choix
                      valeur={config.echeance ?? ''}
                      libelle="Colonne échéance"
                      inconnue={config.echeance}
                      entrees={[{ valeur: '', libelle: 'Aucune' }, ...entreesColonnes(schema.colonnes.filter((c) => c.type === 'date'))]}
                      changer={(v) => {
                        const { echeance: _, ...reste } = config
                        regler(v === '' ? reste : { ...reste, echeance: v })
                      }}
                    />
                  </Reglage>
                </>
              )}
              {r && !r.ok && <p className="erreur">{r.erreur}</p>}
            </Section>
            {!config && (
              <Section>
                <button
                  className="discret outil"
                  onClick={() => {
                    setOuvert(false)
                    void lancer(espace.creerBaseTaches())
                  }}
                >
                  <Icone de={Plus} />
                  Créer une base Tâches
                </button>
              </Section>
            )}
          </div>
        </Flottant>
      )}
    </>
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
  const { etat, espace } = useEspace()
  const lancer = useLancer()
  const consultation = useModeConsultation()
  const aujourdhui = useAujourdhui()
  const [toutes, setToutes] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [gardees, setGardees] = useState<ReadonlySet<string>>(new Set())
  const garder = (cle: string) => setGardees((g) => new Set([...g, cle]))
  const cherche = normaliser(recherche.trim())
  const r = useBaseTaches()
  const t = r?.ok ? r.taches : null
  // La base des tâches vient en premier, ses lignes comme des tâches : elle ne revient pas parmi les autres.
  const ordre = [...etat.groupes.flatMap((g) => g.bases), ...etat.horsGroupe].filter((id) => id !== t?.base)
  let restantes = 0
  let total = 0

  const lignesBase = t
    ? trierTaches(t, lignesTaches(etat, t)).flatMap((l) => {
        const sous = lireTaches(l.corps)
        const faite = estFaite(t, l)
        total += 1 + sous.length
        restantes += (faite ? 0 : 1) + sous.filter((x) => !x.faite).length
        if (!toutes && faite && !gardees.has(`${t.base}/${l.id}`)) return []
        const titreTrouve = cherche === '' || normaliser(titreDe(t.depot, l)).includes(cherche)
        const visibles = sous.filter((x) => (toutes || !x.faite || gardees.has(`${t.base}/${l.id}/${x.ligne}`)) && (titreTrouve || normaliser(texteSimple(x.texte)).includes(cherche)))
        return titreTrouve || visibles.length > 0 ? [{ l, sous: visibles }] : []
      })
    : []

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
      {r && !r.ok && (
        <p className="invalide">
          <Icone de={TriangleAlert} className="alerte" />
          Base des tâches : {r.erreur}
        </p>
      )}
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
        {!consultation && <OptionsTaches />}
      </div>
      {t && (
        <section className="taches-base base-des-taches">
          <h2>{t.depot.schema.nom}</h2>
          <DonneesDe schema={t.depot.schema}>
            <SaisieTache ajouter={(texte) => void lancer(espace.creerLigne(t.base, { [t.depot.schema.champTitre]: texte }))} />
            {lignesBase.length > 0 && <ListeLignesTaches t={t} lignes={lignesBase} ouvrir={ouvrir} aujourdhui={aujourdhui} apresCoche={garder} />}
          </DonneesDe>
        </section>
      )}
      {bases.length === 0 && lignesBase.length === 0 && (
        <p className="discret vide-taches">
          <Icone de={ListChecks} />
          {cherche !== ''
            ? 'Aucune tâche ne correspond.'
            : total === 0
              ? t
                ? 'Aucune tâche pour l’instant.'
                : 'Aucune tâche dans l’espace. Tape « / » puis Tâche dans le contenu d’une page, ou crée une base Tâches dans Options.'
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
                  <ListeTaches depot={depot} ligne={l} taches={visibles} apresCoche={(x) => garder(`${id}/${l.id}/${x.ligne}`)} />
                </div>
              </div>
            ))}
          </DonneesDe>
        </section>
      ))}
    </div>
  )
}
