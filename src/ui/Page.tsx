import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { appliquerVue, valeursHeritees } from '../core/filtres'
import {
  AFFICHAGES,
  champsOrdonnes,
  choisirMiseEnPage,
  corpsEnOnglet,
  ongletsDe,
  proprietesVisibles,
  type Affichage,
  type MiseEnPage,
  type OngletPage,
} from '../core/mise-en-page'
import { colonne as colonneDe, type Schema } from '../core/schema'
import type { Filtre } from '../core/vue'
import { useLancer } from './actions'
import { titreLigne } from './Calendrier'
import { Cellule } from './cellules'
import { useEspace } from './contexte-espace'
import { ICONES } from './EnteteColonne'
import { Flottant } from './flottant'
import { Tableau } from './Tableau'
import { useAujourdhui } from './useAujourdhui'
import { useLargeurPanneau } from './useLargeurPanneau'

type Props = {
  base: string
  id: string
  /** Mise en page retenue par la vue d'où l'on ouvre la ligne (spec §9). */
  miseEnPageDeLaVue?: string | undefined
  /** Vue d'où l'on ouvre la ligne, pour « utiliser cette mise en page pour la vue ». */
  vue?: { base: string; id: string; nom: string } | undefined
  pleinEcran: boolean
  basculerPleinEcran: () => void
  fermer: () => void
  ouvrir: (base: string, id: string) => void
}

// Milkdown pèse lourd : chargé seulement à l'ouverture d'une première page.
const EditeurCorps = lazy(() => import('./EditeurCorps').then((m) => ({ default: m.EditeurCorps })))

const LIBELLES_AFFICHAGE: Record<Affichage, string> = {
  visible: 'Visible',
  masque_si_vide: 'Masqué si vide',
  masque: 'Masqué',
}

/** Page d'une ligne (spec §9) : panneau à droite ou plein écran. */
export function Page(p: Props) {
  const { etat } = useEspace()
  const eb = etat.bases.get(p.base)
  const depot = eb?.depot
  const [idPage, setIdPage] = useState(() => choisirMiseEnPage(eb?.pages ?? [], p.miseEnPageDeLaVue).id)

  const brute = depot?.lignes().find((l) => l.id === p.id)
  const calcule = etat.calculs.get(p.base)?.get(p.id)
  const ligne = brute && (calcule ? { ...brute, cellules: { ...brute.cellules, ...calcule } } : brute)
  const mep = eb?.pages.find((m) => m.id === idPage) ?? choisirMiseEnPage(eb?.pages ?? [])
  const [onglet, setOnglet] = useState(0)

  if (!eb || !depot || !ligne) {
    return (
      <Cadre pleinEcran={p.pleinEcran}>
        <EntetePage {...p} />
        <p className="discret">Cette ligne n'existe plus.</p>
      </Cadre>
    )
  }

  const onglets = mep.onglets
  const actif: OngletPage = onglets[Math.min(onglet, onglets.length - 1)] ?? { type: 'proprietes' }
  const corpsSeul = corpsEnOnglet(mep)

  return (
    <Cadre pleinEcran={p.pleinEcran}>
      <EntetePage {...p}>
        <MenuLigne base={p.base} ligne={ligne} fermerPage={p.fermer} />
        <ReglagesPage base={p.base} schema={depot.schema} mep={mep} choisir={setIdPage} vue={p.vue} />
      </EntetePage>
      <div className="contenu-page">
        <Titre depot={depot} ligne={ligne} />

        {onglets.length > 0 && (
          <div className="onglets onglets-page">
            {onglets.map((o, i) => (
              <div key={i} className={`onglet ${o === actif ? 'actif' : ''}`} onClick={() => setOnglet(i)}>
                {o.type === 'proprietes' ? 'Propriétés' : o.type === 'corps' ? 'Contenu' : (colonneDe(depot.schema, o.relation)?.nom ?? `⚠ ${o.relation}`)}
              </div>
            ))}
          </div>
        )}

        {actif.type === 'proprietes' && <Proprietes depot={depot} ligne={ligne} mep={mep} />}
        {actif.type === 'corps' && <Corps depot={depot} ligne={ligne} />}
        {actif.type === 'relation' && (
          <OngletRelation key={actif.relation} base={p.base} schema={depot.schema} ligne={ligne} onglet={actif} ouvrir={p.ouvrir} />
        )}
        {/* Sans onglet dédié, le corps reste sous les onglets, quel que soit l'onglet actif. */}
        {!corpsSeul && <Corps depot={depot} ligne={ligne} />}
      </div>
    </Cadre>
  )
}

/** Panneau à droite, étirable par son bord gauche ; plein écran, il prend toute la place. */
function Cadre({ pleinEcran, children }: { pleinEcran: boolean; children: ReactNode }) {
  const [largeur, saisir] = useLargeurPanneau()
  return (
    <div className={`cadre-page ${pleinEcran ? 'plein-ecran' : ''}`} style={pleinEcran ? undefined : { width: largeur }}>
      {!pleinEcran && <div className="poignee-page" onPointerDown={saisir} title="Tirer pour élargir" />}
      <aside className={`page ${pleinEcran ? 'plein-ecran' : ''}`}>{children}</aside>
    </div>
  )
}

function EntetePage(p: Props & { children?: ReactNode }) {
  return (
    <div className="entete-page">
      <button className="discret" onClick={p.fermer} title="Fermer (Échap)">
        ✕
      </button>
      <button className="discret" onClick={p.basculerPleinEcran} title={p.pleinEcran ? 'Panneau latéral' : 'Plein écran'}>
        {p.pleinEcran ? '⇥' : '⤢'}
      </button>
      <span className="discret astuce-clavier">↑ ↓ pour changer de ligne</span>
      <div className="espace-libre" />
      {p.children}
    </div>
  )
}

/** Menu ⋯ de la page : suppression de la ligne, avec les liens vers elle (spec §5). */
function MenuLigne({ base, ligne, fermerPage }: { base: string; ligne: LigneChargee; fermerPage: () => void }) {
  const { espace } = useEspace()
  const lancer = useLancer()
  const ancre = useRef<HTMLButtonElement>(null)
  const [etape, setEtape] = useState<'ferme' | 'menu' | 'confirmer'>('ferme')
  const [nettoyer, setNettoyer] = useState(true)
  const liens = etape === 'confirmer' ? espace.liensVers(base, ligne.id).length : 0
  const titre = titreLigne(ligne, espace.etat().bases.get(base)!.depot!.schema.champTitre)

  return (
    <>
      <button ref={ancre} className="discret" onClick={() => setEtape('menu')} aria-label="Actions de la ligne">
        ⋯
      </button>
      {etape === 'menu' && (
        <Flottant ancre={ancre.current} fermer={() => setEtape('ferme')}>
          <button className="option danger-texte" onClick={() => setEtape('confirmer')}>
            Supprimer la ligne…
          </button>
        </Flottant>
      )}
      {etape === 'confirmer' && (
        <Flottant ancre={ancre.current} fermer={() => setEtape('ferme')}>
          <div className="confirmation">
            <p>
              Supprimer « {titre} » ? Son fichier est effacé du dossier <code>{base}</code>.
            </p>
            {liens > 0 && (
              <label className="case-a-cocher">
                <input type="checkbox" checked={nettoyer} onChange={(e) => setNettoyer(e.target.checked)} />
                {liens === 1 ? 'Retirer aussi le lien qui pointe vers elle' : `Retirer aussi les ${liens} liens qui pointent vers elle`}
                <span className="discret"> (sinon ils restent, signalés comme cassés)</span>
              </label>
            )}
            <div className="boutons">
              <button onClick={() => setEtape('ferme')}>Annuler</button>
              <button
                className="danger"
                onClick={() => {
                  setEtape('ferme')
                  fermerPage()
                  void lancer(espace.supprimerLigne(base, ligne.chemin, nettoyer))
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </Flottant>
      )}
    </>
  )
}

function Titre({ depot, ligne }: { depot: DepotBase; ligne: LigneChargee }) {
  const cle = depot.schema.champTitre
  const c = ligne.cellules[cle]
  const valeur = c?.etat === 'ok' ? String(c.valeur) : ''
  return (
    <input
      className="titre-page"
      placeholder="Sans titre"
      value={valeur}
      onChange={(e) => depot.modifier(ligne.chemin, cle, e.target.value)}
      // Le fichier est renommé à la sortie du titre, jamais à chaque frappe (spec §3).
      onBlur={() => void depot.renommerSelonTitre(ligne.chemin)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function Proprietes({ depot, ligne, mep }: { depot: DepotBase; ligne: LigneChargee; mep: MiseEnPage }) {
  const { espace } = useEspace()
  const [voirMasquees, setVoirMasquees] = useState(false)
  const { visibles, masquees } = proprietesVisibles(depot.schema, mep, ligne)
  const creerOption = async (cle: string, label: string) => (await espace.ajouterOption(depot.schema.id, cle, label)).label
  const rangee = (c: (typeof visibles)[number]) => (
    <div key={c.cle} className="propriete">
      <div className="nom-propriete">
        <span className="icone">{ICONES[c.type]}</span>
        {c.nom}
      </div>
      <div className="valeur-propriete">
        <Cellule depot={depot} ligne={ligne} colonne={c} creerOption={creerOption} surModification={() => {}} />
      </div>
    </div>
  )
  return (
    <div className="proprietes">
      {visibles.map(rangee)}
      {voirMasquees && masquees.map(rangee)}
      {masquees.length > 0 && (
        <button className="discret voir-masquees" onClick={() => setVoirMasquees(!voirMasquees)}>
          {voirMasquees ? 'Cacher' : `${masquees.length} propriété${masquees.length > 1 ? 's' : ''} masquée${masquees.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

function Corps({ depot, ligne }: { depot: DepotBase; ligne: LigneChargee }) {
  // Le chemin peut changer (renommage) : on retrouve toujours la ligne par son id au moment d'écrire.
  const idLigne = ligne.id
  // Corps changé sur le disque (autre machine) : l'éditeur est remonté, sinon
  // il garderait l'ancien texte et le réécrirait à la frappe suivante.
  const emis = useRef(ligne.corps)
  const [suivi, setSuivi] = useState({ corps: ligne.corps, version: 0 })
  if (ligne.corps !== suivi.corps) setSuivi({ corps: ligne.corps, version: suivi.version + (ligne.corps === emis.current ? 0 : 1) })
  return (
    <div className="corps-page">
      <Suspense fallback={<div className="discret">Chargement de l'éditeur…</div>}>
        <EditeurCorps
          key={`${idLigne}:${suivi.version}`}
          initial={ligne.corps}
          changer={(md) => {
            emis.current = md
            const actuelle = depot.lignes().find((l) => l.id === idLigne)
            if (actuelle) depot.modifierCorps(actuelle.chemin, md)
          }}
        />
      </Suspense>
    </div>
  )
}

/**
 * Onglet relation (spec §9) : une vue tableau de la base liée, filtrée sur
 * « lié à cette page ». Son « + » crée une ligne déjà liée par l'héritage des
 * filtres (§8), sans code spécifique.
 */
function OngletRelation(p: { base: string; schema: Schema; ligne: LigneChargee; onglet: Extract<OngletPage, { type: 'relation' }>; ouvrir: Props['ouvrir'] }) {
  const { espace, etat } = useEspace()
  const aujourdhui = useAujourdhui()
  const [persistantes, setPersistantes] = useState<ReadonlySet<string>>(new Set())
  const relation = colonneDe(p.schema, p.onglet.relation)
  const cible = relation?.type === 'relation' ? etat.bases.get(relation.cible) : undefined
  const depotCible = cible?.depot
  const calculs = cible ? etat.calculs.get(cible.id) : undefined

  const filtre = useMemo<Filtre | null>(
    () => (relation?.type === 'relation' ? { colonne: relation.inverse, operateur: 'contient', valeur: p.ligne.id } : null),
    [relation, p.ligne.id],
  )
  const lignesVue = useMemo(() => {
    if (!depotCible || !filtre) return []
    const lignes = depotCible.lignes().map((l) => {
      const c = calculs?.get(l.id)
      return c ? { ...l, cellules: { ...l.cellules, ...c } } : l
    })
    return appliquerVue(lignes, depotCible.schema, [filtre], [], { aujourdhui }, persistantes)
    // `etat` change à chaque modification de lignes : il rafraîchit l'onglet.
  }, [depotCible, calculs, filtre, aujourdhui, persistantes, etat])

  if (relation?.type !== 'relation' || !cible || !depotCible || !filtre) {
    return <p className="invalide">⚠ Relation « {p.onglet.relation} » introuvable</p>
  }
  // Par défaut, toutes les colonnes sauf celle qui pointe vers cette page (toujours la même valeur).
  const colonnes = p.onglet.colonnes.length > 0 ? p.onglet.colonnes : depotCible.schema.colonnes.map((c) => c.cle).filter((c) => c !== relation.inverse)

  return (
    <div className="onglet-relation">
      <Tableau
        espace={espace}
        base={cible.id}
        depot={depotCible}
        lignesVue={lignesVue}
        tris={[]}
        valeursCreation={() => valeursHeritees(depotCible.schema, [filtre])}
        retenir={(id) => setPersistantes(new Set([...persistantes, id]))}
        colonnesVisibles={colonnes}
        ouvrir={(l) => p.ouvrir(cible.id, l.id)}
      />
    </div>
  )
}

/** Choix et réglage de la mise en page : affichage des champs, relations et corps en onglet. */
function ReglagesPage(p: {
  base: string
  schema: Schema
  mep: MiseEnPage
  choisir: (id: string) => void
  vue: Props['vue']
}) {
  const { espace, etat } = useEspace()
  const lancer = useLancer()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const pages = etat.bases.get(p.base)?.pages ?? []
  const { mep, schema } = p

  const champs = champsOrdonnes(schema, mep).filter((c) => c.colonne.cle !== schema.champTitre)
  const relationsOnglet = mep.onglets.flatMap((o) => (o.type === 'relation' ? [{ relation: o.relation, colonnes: o.colonnes }] : []))
  const corps = corpsEnOnglet(mep)
  const modifier = (m: Parameters<typeof espace.modifierMiseEnPage>[2]) => void lancer(espace.modifierMiseEnPage(p.base, mep.id, m))
  const ecrireChamps = (liste: typeof champs) => modifier({ champs: liste.map((c) => ({ cle: c.colonne.cle, affichage: c.affichage })) })
  const deplacer = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= champs.length) return
    const l = [...champs]
    ;[l[i], l[j]] = [l[j]!, l[i]!]
    ecrireChamps(l)
  }
  const vueUtilise = p.vue && etat.bases.get(p.vue.base)?.vues.find((v) => v.id === p.vue!.id)?.miseEnPage === mep.id

  return (
    <>
      <button ref={ancre} className="discret" onClick={() => setOuvert(true)}>
        {mep.nom} ▾
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau reglages-page">
            <div className="ligne-filtre">
              <select value={mep.id} onChange={(e) => p.choisir(e.target.value)}>
                {pages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                    {m.defaut ? ' (par défaut)' : ''}
                  </option>
                ))}
              </select>
              <button
                className="discret"
                onClick={async () => {
                  const id = await lancer(espace.creerMiseEnPage(p.base, `${mep.nom} (copie)`, mep.id))
                  if (id) p.choisir(id)
                }}
              >
                + Dupliquer
              </button>
              {pages.length > 1 && (
                <button
                  className="discret danger-texte"
                  onClick={() => {
                    const autre = pages.find((m) => m.id !== mep.id)!
                    p.choisir(autre.id)
                    void lancer(espace.supprimerMiseEnPage(p.base, mep.id))
                  }}
                >
                  Supprimer
                </button>
              )}
            </div>
            <label className="case-reglage">
              Nom
              <input
                key={mep.id}
                defaultValue={mep.nom}
                onBlur={(e) => e.target.value.trim() && e.target.value !== mep.nom && modifier({ nom: e.target.value.trim() })}
              />
            </label>
            <label className="case-reglage">
              <input type="checkbox" checked={mep.defaut} disabled={mep.defaut} onChange={() => modifier({ defaut: true })} />
              Mise en page par défaut de la base
            </label>
            {p.vue && p.vue.base === p.base && (
              <label className="case-reglage">
                <input
                  type="checkbox"
                  checked={vueUtilise}
                  onChange={(e) => void lancer(espace.modifierVue(p.base, p.vue!.id, { miseEnPage: e.target.checked ? mep.id : undefined }))}
                />
                Utiliser pour ouvrir les lignes de la vue « {p.vue.nom} »
              </label>
            )}

            <div className="titre-section">Champs</div>
            {champs.map((c, i) => {
              const enOnglet = relationsOnglet.some((r) => r.relation === c.colonne.cle)
              return (
                <div key={c.colonne.cle} className="ligne-filtre champ-page">
                  <span className="deplacer">
                    <button className="discret" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label="Monter">
                      ↑
                    </button>
                    <button className="discret" onClick={() => deplacer(i, 1)} disabled={i === champs.length - 1} aria-label="Descendre">
                      ↓
                    </button>
                  </span>
                  <span className="nom-champ">
                    <span className="icone">{ICONES[c.colonne.type]}</span>
                    {c.colonne.nom}
                  </span>
                  <select
                    value={c.affichage}
                    disabled={enOnglet}
                    onChange={(e) => ecrireChamps(champs.map((x) => (x === c ? { ...x, affichage: e.target.value as Affichage } : x)))}
                  >
                    {AFFICHAGES.map((a) => (
                      <option key={a} value={a}>
                        {LIBELLES_AFFICHAGE[a]}
                      </option>
                    ))}
                  </select>
                  {c.colonne.type === 'relation' && (
                    <label className="case-reglage">
                      <input
                        type="checkbox"
                        checked={enOnglet}
                        onChange={(e) =>
                          modifier({
                            onglets: ongletsDe(
                              e.target.checked
                                ? [...relationsOnglet, { relation: c.colonne.cle, colonnes: [] }]
                                : relationsOnglet.filter((r) => r.relation !== c.colonne.cle),
                              corps,
                            ),
                          })
                        }
                      />
                      en onglet
                    </label>
                  )}
                </div>
              )
            })}
            <label className="case-reglage">
              <input type="checkbox" checked={corps} onChange={(e) => modifier({ onglets: ongletsDe(relationsOnglet, e.target.checked) })} />
              Contenu (corps de la page) dans son propre onglet
            </label>
          </div>
        </Flottant>
      )}
    </>
  )
}
