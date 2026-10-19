import { Fragment, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LigneChargee } from '../core/base'
import {
  ajusterSurPeriode,
  nomNiveau,
  arrondiJours,
  calculerCharge,
  capaciteDe,
  couvrirBesoins,
  decalerPeriode,
  empiler,
  etatCase,
  periodes as periodesDe,
  PERIODES_PAR_DEFAUT,
  roleDe,
  type CaseCharge,
  type Maille,
  type Periode,
  type ReglagesCharge,
} from '../core/charge'
import { COULEURS, couleurDeLigne } from '../core/couleurs'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import { colonne as colonneDe, type Schema } from '../core/schema'
import { decaler, jourDe, jourSemaine, JOURS_COURTS, libelleMois, MOIS_COURTS } from '../core/temps'
import type { ModificationVue, Vue } from '../core/vue'
import { useLancer } from './actions'
import { Choix } from './Choix'
import { useEspace } from './contexte-espace'
import { couleurOption } from './couleurs'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { useConsultation } from './mode'
import { useAujourdhui } from './useAujourdhui'

// Plan de charge (spec §21) : la base des ressources en grille ressources ×
// périodes (jour, semaine ou mois), chaque case la charge sur la capacité
// nette ; « Par projet », la couverture des besoins ; « Graphique », la charge
// empilée par projet ou par version. Les chiffres viennent de `core/charge`.

type Props = {
  espace: DepotEspace
  base: string
  vue: Vue
  modifierVue: (m: ModificationVue) => void
  lignesVue: LigneVue[]
  ouvrirPage: (base: string, id: string) => void
}

type Mode = 'ressources' | 'projets' | 'graphique'

const nombre = (n: number) => String(arrondiJours(n)).replace('.', ',')
/** À la journée, au dixième (0,8 j) : le demi-jour y fausserait la lecture. */
const nombreFin = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const libelleJour = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS_COURTS[Number(iso.slice(5, 7)) - 1]}`
const SANS_GROUPE = '\u0000'
const TOUS = ''
/** Navigation : un pas des flèches, en périodes. */
const PAS: Record<Maille, number> = { jour: 5, semaine: 4, mois: 3 }
const MAILLES: { maille: Maille; nom: string }[] = [
  { maille: 'jour', nom: 'Jour' },
  { maille: 'semaine', nom: 'Semaine' },
  { maille: 'mois', nom: 'Mois' },
]

function libellePeriode(maille: Maille, p: Periode): string {
  if (maille === 'mois') return `${MOIS_COURTS[Number(p.debut.slice(5, 7)) - 1]} ${p.debut.slice(2, 4)}`
  if (maille === 'semaine') return libelleJour(p.debut)
  return `${JOURS_COURTS[(jourSemaine(p.debut) + 6) % 7]} ${Number(p.debut.slice(8, 10))}`
}

/** Bandeau au-dessus des colonnes : le mois et l'année (jour, semaine), l'année (mois). */
function bandeau(maille: Maille, colonnes: Periode[]): { libelle: string; n: number }[] {
  const bandes: { libelle: string; n: number }[] = []
  for (const p of colonnes) {
    const libelle = maille === 'mois' ? p.debut.slice(0, 4) : libelleMois(p.debut)
    const der = bandes.at(-1)
    if (der?.libelle === libelle) der.n++
    else bandes.push({ libelle, n: 1 })
  }
  return bandes
}


/** Mélange de deux couleurs `#rrggbb` : `t` = 0 donne `a`, 1 donne `b`. */
function melange(a: string, b: string, t: number): string {
  const canal = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map((i) => Math.round(canal(a, i) + (canal(b, i) - canal(a, i)) * t).toString(16).padStart(2, '0')).join('')}`
}

/** Glisser sur les cases d'une ligne : la ressource et les périodes choisies. */
type Selection = { ressource: string; de: number; a: number; bloc?: string; projet?: string; version?: string }
type Regrouper = 'role' | 'projet' | 'version'

export function PlanCharge({ espace, base, vue, modifierVue, lignesVue, ouvrirPage }: Props) {
  const { etat } = useEspace()
  const lecture = useConsultation()
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const [mailleLocale, setMailleLocale] = useState<Maille | null>(null)
  const [regrouperLocal, setRegrouperLocal] = useState<Regrouper | null>(null)
  const [curseur, setCurseur] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('ressources')
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const [detail, setDetail] = useState<{ ancre: HTMLElement; ressource: string; i: number; bloc?: { projet?: string; version?: string; cle: string } } | null>(null)
  const [portee, setPortee] = useState<'periode' | 'tout'>('periode')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [choixProjet, setChoixProjet] = useState<{ ancre: HTMLElement; s: Selection } | null>(null)
  const glisse = useRef(false)

  const r: ReglagesCharge = vue
  const maille: Maille = mailleLocale ?? vue.maille ?? 'semaine'
  const n = vue.periodes ?? PERIODES_PAR_DEFAUT[maille]
  const fmt = maille === 'jour' ? nombreFin : nombre
  // Par défaut : la semaine précédente en tête, le jour même, le mois en cours.
  const depart = curseur ?? (maille === 'semaine' ? decaler(aujourdhui, -7) : aujourdhui)
  const colonnes = useMemo(() => periodesDe(maille, depart, n), [maille, depart, n])
  const lignesDe = (id: string | undefined) => (id ? (etat.bases.get(id)?.depot?.lignes() ?? []) : [])
  const affectations = lignesDe(r.affectations?.base)
  const absences = lignesDe(r.absences?.base)
  const besoins = lignesDe(r.besoins?.base)
  const ressources = useMemo(() => lignesVue.map((lv) => lv.ligne), [lignesVue])
  const charge = useMemo(() => calculerCharge(r, ressources, affectations, absences, colonnes), [r, ressources, affectations, absences, colonnes])

  const schema = etat.bases.get(base)?.depot?.schema
  const schemaAff = r.affectations ? etat.bases.get(r.affectations.base)?.depot?.schema : undefined
  const cible = (s: Schema | undefined, cle: string | undefined) => {
    const c = s && cle ? colonneDe(s, cle) : undefined
    return c?.type === 'relation' ? c.cible : undefined
  }
  const baseProjets = cible(schemaAff, r.affectations?.projet)
  const baseVersions = cible(schemaAff, r.affectations?.version)
  const nomProjet = nomNiveau(baseProjets ? etat.bases.get(baseProjets)?.depot?.schema.nom : undefined, 'projet')
  const nomVersion = nomNiveau(baseVersions ? etat.bases.get(baseVersions)?.depot?.schema.nom : undefined, 'version')
  const titre = (b: string | undefined, id: string) => (b && etat.titres.get(b)?.get(id)) || id || `Sans ${nomProjet}`
  const projets = lignesDe(baseProjets)
  const versions = lignesDe(baseVersions)
  const schemaVersions = baseVersions ? etat.bases.get(baseVersions)?.depot?.schema : undefined
  const colDateVersion = schemaVersions?.colonnes.find((c) => c.type === 'date')
  const colProjetVersion = schemaVersions?.colonnes.find((c) => c.type === 'relation' && c.cible === baseProjets)
  const jalons = versions.flatMap((v) => {
    const c = colDateVersion && v.cellules[colDateVersion.cle]
    const d = c?.etat === 'ok' ? jourDe(c.valeur) : null
    return d ? [{ id: v.id, date: d }] : []
  })

  const projetDeVersion = (v: string) => {
    if (v.startsWith('@')) return v.slice(1)
    const l = versions.find((x) => x.id === v)
    const c = l && colProjetVersion && l.cellules[colProjetVersion.cle]
    const valeur = c?.etat === 'ok' ? c.valeur : undefined
    return Array.isArray(valeur) ? String(valeur[0] ?? '') : typeof valeur === 'string' ? valeur : ''
  }
  if (!r.affectations || !schemaAff) {
    return <p className="discret">Choisis la base des affectations dans « Options » : qui travaille sur quel projet, de quand à quand, combien de jours par semaine ou au total.</p>
  }

  // Groupes : options du choix dans leur ordre, puis les autres valeurs, puis sans groupe.
  const colGroupe = schema && r.groupe ? colonneDe(schema, r.groupe) : undefined
  const ordreGroupes = colGroupe?.type === 'select' ? colGroupe.options.map((o) => o.label) : []
  const groupes = new Map<string, LigneChargee[]>()
  for (const l of ressources) {
    const g = (colGroupe && roleDe(r, l)) || SANS_GROUPE
    groupes.set(g, [...(groupes.get(g) ?? []), l])
  }
  const cles = [...groupes.keys()].sort((a, b) => {
    const rang = (g: string) => (g === SANS_GROUPE ? 1e9 : ordreGroupes.indexOf(g) === -1 ? 1e8 : ordreGroupes.indexOf(g))
    return rang(a) - rang(b) || a.localeCompare(b)
  })

  // Lignes de la grille : par rôle (ressources et leur charge totale), ou par projet / version (ressources et leur part).
  const regrouper: Regrouper = regrouperLocal ?? (r.affectations.version || vue.regrouper !== 'version' ? (vue.regrouper ?? 'role') : 'role')
  type Bloc = { cle: string; libelle: string | null; ressources: LigneChargee[]; part: ((c: CaseCharge) => number) | null; projet?: string; version?: string }
  const blocs: Bloc[] = (() => {
    if (regrouper === 'role') return cles.map((g) => ({ cle: g, libelle: colGroupe ? (g === SANS_GROUPE ? 'Sans valeur' : g) : null, ressources: groupes.get(g)!, part: null }))
    const champ = regrouper === 'projet' ? 'parProjet' : 'parVersion'
    const presentes = new Set(ressources.flatMap((l) => charge.get(l.id)!.flatMap((c) => Object.keys(c[champ]))))
    const ordre = regrouper === 'projet' ? [...projets.map((x) => x.id), ''] : [...versions.map((x) => x.id), ...projets.map((x) => `@${x.id}`), '@']
    const rang = (k: string) => (ordre.indexOf(k) === -1 ? 1e9 : ordre.indexOf(k))
    return [...presentes]
      .sort((a, b) => rang(a) - rang(b))
      .map((k) => {
        const projet = regrouper === 'projet' ? k : projetDeVersion(k)
        const libelle =
          regrouper === 'projet' ? titre(baseProjets, k) : k.startsWith('@') ? `${titre(baseProjets, k.slice(1))} (sans ${nomVersion})` : `${titre(baseProjets, projet)} · ${titre(baseVersions, k)}`
        return {
          cle: k,
          libelle,
          ressources: ressources.filter((l) => charge.get(l.id)!.some((c) => (c[champ][k] ?? 0) > 0)),
          part: (c: CaseCharge) => c[champ][k] ?? 0,
          projet: projet || undefined,
          version: regrouper === 'version' && !k.startsWith('@') ? k : undefined,
        }
      })
  })()
  const changerRegrouper = (g: Regrouper) => {
    setOuvertes(new Set())
    if (lecture) setRegrouperLocal(g)
    else {
      setRegrouperLocal(null)
      modifierVue({ regrouper: g === 'role' ? undefined : g })
    }
  }

  const changerMaille = (m: Maille) => {
    setCurseur(null)
    setSelection(null)
    if (lecture) setMailleLocale(m)
    else {
      setMailleLocale(null)
      modifierVue({ maille: m === 'semaine' ? undefined : m, periodes: undefined })
    }
  }
  const basculer = (id: string) => setOuvertes((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])))

  /** Fin d'un glisser ou clic sur une case libre : dans un bloc de projet, l'affectation se crée aussitôt ; sinon on choisit le projet. */
  const finirChoix = (ancre: HTMLElement, s: Selection) => {
    if (s.projet !== undefined) void creerAffectation(s, s.projet)
    else setChoixProjet({ ancre, s })
  }
  const finirGlisse = (ancre: HTMLElement) => {
    if (!glisse.current || !selection) return
    glisse.current = false
    finirChoix(ancre, selection)
  }

  /** Nouvelle affectation sur les périodes choisies : au total à la journée (si la base le permet), sinon en jours par semaine, sur ce qui reste libre. */
  const creerAffectation = async (s: Selection, projet: string) => {
    setChoixProjet(null)
    setSelection(null)
    const a = r.affectations!
    const [de, jusqua] = s.de <= s.a ? [s.de, s.a] : [s.a, s.de]
    const res = ressources.find((l) => l.id === s.ressource)
    const cap = res ? capaciteDe(r, res) : 5
    const cases = (charge.get(s.ressource)?.slice(de, jusqua + 1) ?? []).filter((c) => c.ouvres > 0)
    const libres = cases.map((c) => Math.max(0, c.capacite - c.charge))
    const valeurs =
      maille === 'jour' && a.total
        ? { [a.total]: Math.max(0.5, arrondiJours(libres.reduce((x, y) => x + y, 0))) }
        : { [a.jours]: Math.min(cap, Math.max(0.5, arrondiJours(Math.min(...cases.map((c, i) => (libres[i]! * 5) / c.ouvres), cap)))) }
    await lancer(
      espace.creerLigne(a.base, {
        [schemaAff.champTitre]: `${titre(base, s.ressource)} sur ${titre(baseProjets, projet)}`,
        [a.ressource]: [s.ressource],
        [a.projet]: [projet],
        ...(s.version && a.version ? { [a.version]: [s.version] } : {}),
        [a.debut]: colonnes[de]!.debut,
        [a.fin]: colonnes[jusqua]!.fin,
        ...valeurs,
      }),
    )
  }

  const dansSelection = (ressource: string, i: number, bloc: string) =>
    selection?.ressource === ressource && selection.bloc === bloc && i >= Math.min(selection.de, selection.a) && i <= Math.max(selection.de, selection.a)
  /** Une affectation appartient au bloc (projet ou version) de la ligne. */
  const dansBloc = (id: string, bloc: { cle: string; projet?: string; version?: string }) => {
    const l = affectations.find((x) => x.id === id)
    if (!l) return false
    const lu = (cle: string | undefined) => {
      const c = cle ? l.cellules[cle] : undefined
      const v = c?.etat === 'ok' ? c.valeur : undefined
      return Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : ''
    }
    if (regrouper === 'projet') return lu(r.affectations!.projet) === bloc.cle
    return bloc.cle.startsWith('@') ? lu(r.affectations!.version) === '' && lu(r.affectations!.projet) === bloc.cle.slice(1) : lu(r.affectations!.version) === bloc.cle
  }
  const jalonsDe = (p: Periode) => jalons.filter((j) => j.date >= p.debut && j.date <= p.fin)

  // Couleurs : l'option de `couleur_par` (colonne des projets), sinon la palette dans l'ordre des projets ; les versions en nuances.
  const schemaProjets = baseProjets ? etat.bases.get(baseProjets)?.depot?.schema : undefined
  const PALETTE = COULEURS.filter((c) => c !== 'gris')
  const couleurProjet = (id: string): { fond: string; texte: string } => {
    const l = projets.find((p) => p.id === id)
    if (!l) return couleurOption('gris')
    const parOption = schemaProjets && vue.couleurPar ? couleurDeLigne(l, schemaProjets, { couleurPar: vue.couleurPar }) : undefined
    return couleurOption(parOption ?? PALETTE[projets.indexOf(l) % PALETTE.length])
  }


  return (
    <div className="plan-charge">
      <div className="barre-charge">
        <div className="bascule-charge" role="tablist" aria-label="Mode">
          {(
            [
              ['ressources', 'Par ressource'],
              ['projets', 'Besoins'],
              ['graphique', 'Graphique'],
            ] as const
          ).map(([m, nom]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'actif' : ''} onClick={() => setMode(m)}>
              {nom}
            </button>
          ))}
        </div>
        {mode !== 'projets' && (
          <>
            <div className="bascule-charge" role="radiogroup" aria-label="Maille">
              {MAILLES.map((m) => (
                <button key={m.maille} role="radio" aria-checked={maille === m.maille} className={maille === m.maille ? 'actif' : ''} onClick={() => changerMaille(m.maille)}>
                  {m.nom}
                </button>
              ))}
            </div>
            {mode === 'ressources' && (
              <Choix
                valeur={regrouper}
                entrees={[
                  { valeur: 'role', libelle: colGroupe ? `Par ${colGroupe.nom.toLowerCase()}` : 'Sans groupe' },
                  { valeur: 'projet', libelle: `Par ${nomProjet}` },
                  ...(r.affectations.version ? [{ valeur: 'version', libelle: `Par ${nomVersion}` }] : []),
                ]}
                libelle="Grouper par"
                changer={(v) => changerRegrouper(v as Regrouper)}
              />
            )}
            <div className="navigation-charge">
              <button className="discret" aria-label="Périodes précédentes" onClick={() => setCurseur(decalerPeriode(maille, depart, -PAS[maille]))}>
                <Icone de={ChevronLeft} />
              </button>
              <button className="discret" onClick={() => setCurseur(null)}>
                Aujourd’hui
              </button>
              <button className="discret" aria-label="Périodes suivantes" onClick={() => setCurseur(decalerPeriode(maille, depart, PAS[maille]))}>
                <Icone de={ChevronRight} />
              </button>
            </div>
          </>
        )}
        {mode === 'ressources' && (
          <div className="legende-charge discret">
            <span className="charge-libre" /> libre
            <span className="charge-pleine" /> pleine
            <span className="charge-surchargee" /> surchargée
            <span className="charge-absente" /> absente
          </div>
        )}
      </div>

      {mode === 'ressources' && (
        <div className="grille-charge-defilement">
          <table className={`grille-charge maille-${maille}`} onPointerLeave={() => !glisse.current && setSelection(null)}>
            <thead>
              <tr className="bandeau-charge">
                <th className="nom-charge" rowSpan={2}>
                  Ressource
                </th>
                {bandeau(maille, colonnes).map((b, i) => (
                  <th key={i} colSpan={b.n}>
                    {b.libelle}
                  </th>
                ))}
              </tr>
              <tr>
                {colonnes.map((p) => {
                  const ici = jalonsDe(p)
                  return (
                    <th key={p.debut} className={p.debut <= aujourdhui && aujourdhui <= p.fin ? 'periode-courante' : ''} title={maille === 'jour' ? libelleJour(p.debut) : undefined}>
                      {libellePeriode(maille, p)}
                      {ici.length > 0 && <span className="jalon-charge" title={ici.map((j) => `${titre(baseVersions, j.id)} : ${libelleJour(j.date)}`).join('\n')} aria-label={`Sortie : ${ici.map((j) => titre(baseVersions, j.id)).join(', ')}`} />}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {blocs.map((bloc) => (
                <Fragment key={bloc.cle}>
                  {bloc.libelle !== null && (
                    <tr className="groupe-charge">
                      <th className="nom-charge">
                        {bloc.libelle}
                        <span className="discret"> {bloc.ressources.length}</span>
                      </th>
                      {colonnes.map((p, i) => {
                        const cases = bloc.ressources.map((res) => charge.get(res.id)![i]!)
                        const total = cases.reduce((s, c) => s + (bloc.part ? bloc.part(c) : c.charge), 0)
                        const cap = cases.reduce((s, c) => s + c.capacite, 0)
                        return (
                          <td key={p.debut} className="total-charge">
                            {total > 0 ? (bloc.part ? fmt(total) : `${fmt(total)} / ${fmt(cap)}`) : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )}
                  {bloc.ressources.map((res) => {
                    const cases = charge.get(res.id)!
                    const cleLigne = `${bloc.cle}\u0000${res.id}`
                    const ouverte = ouvertes.has(cleLigne)
                    const projetsDeLaLigne = bloc.part ? [] : [...new Set(cases.flatMap((c) => Object.keys(c.parProjet)))]
                    return (
                      <Fragment key={res.id}>
                        <tr className="ressource-charge">
                          <th className="nom-charge">
                            {!bloc.part && (
                              <button className="discret deplier-charge" aria-label={ouverte ? 'Replier' : `Déplier par ${nomProjet}`} aria-expanded={ouverte} disabled={projetsDeLaLigne.length === 0} onClick={() => basculer(cleLigne)}>
                                <Icone de={ChevronRight} className={ouverte ? 'deplie' : ''} />
                              </button>
                            )}
                            <button className="lien-charge" onClick={() => ouvrirPage(base, res.id)}>
                              {titre(base, res.id)}
                            </button>
                          </th>
                          {cases.map((c, i) => {
                            const e = etatCase(c)
                            const part = bloc.part ? bloc.part(c) : c.charge
                            const visible = !(e === 'absente' || e === 'vide' || e === 'fermee') && part > 0
                            return (
                              <td
                                key={c.debut}
                                className={`case-charge charge-${e} ${bloc.part && part === 0 ? 'hors-bloc' : ''} ${dansSelection(res.id, i, bloc.cle) ? 'selection' : ''}`}
                                title={e === 'fermee' ? 'Jour férié' : `${bloc.part ? `${fmt(part)} j ici, ` : ''}${fmt(c.charge)} j sur ${fmt(c.capacite)} j${c.absence ? `, ${c.absence} j d’absence` : ''}`}
                                onPointerDown={(ev) => {
                                  if (lecture || ev.button !== 0) return
                                  glisse.current = true
                                  setSelection({ ressource: res.id, de: i, a: i, bloc: bloc.cle, projet: bloc.projet, version: bloc.version })
                                }}
                                onPointerEnter={() => glisse.current && selection?.ressource === res.id && selection.bloc === bloc.cle && setSelection({ ...selection, a: i })}
                                onPointerUp={(ev) => {
                                  const s = selection
                                  if (glisse.current && s && s.de === s.a) {
                                    glisse.current = false
                                    setSelection(null)
                                    const dansLeBloc = c.affectations.filter((id) => !bloc.part || dansBloc(id, bloc))
                                    if (dansLeBloc.length > 0) {
                                      setPortee('periode')
                                      setDetail({ ancre: ev.currentTarget, ressource: res.id, i, bloc: bloc.part ? bloc : undefined })
                                    } else if (!lecture && e !== 'fermee') finirChoix(ev.currentTarget, s)
                                    return
                                  }
                                  finirGlisse(ev.currentTarget)
                                }}
                              >
                                {!visible ? '' : maille === 'jour' || bloc.part ? fmt(part) : `${fmt(c.charge)} / ${fmt(c.capacite)}`}
                              </td>
                            )
                          })}
                        </tr>
                        {ouverte &&
                          projetsDeLaLigne.map((p) => (
                            <tr key={p} className="projet-charge">
                              <th className="nom-charge">{titre(baseProjets, p)}</th>
                              {cases.map((c) => (
                                <td key={c.debut}>{c.parProjet[p] ? fmt(c.parProjet[p]) : ''}</td>
                              ))}
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!lecture && <p className="discret aide-charge">Glisse sur les {maille === 'jour' ? 'jours' : maille === 'mois' ? 'mois' : 'semaines'} d’une ressource pour l’affecter à un projet ; clique une case pour voir ce qui la compose.</p>}
        </div>
      )}

      {mode === 'projets' && <ParProjet r={r} ressources={ressources} affectations={affectations} besoins={besoins} titre={titre} baseProjets={baseProjets} />}

      {mode === 'graphique' && (
        <GraphiqueCharge
          maille={maille}
          colonnes={colonnes}
          charge={charge}
          ressources={ressources}
          roles={cles.filter((g) => g !== SANS_GROUPE)}
          roleDe={(l) => roleDe(r, l)}
          versions={r.affectations.version !== undefined}
          ordreProjets={projets.map((p) => p.id)}
          ordreVersions={versions.map((v) => v.id)}
          couleur={(cle, par) => {
            if (par === 'projet') return couleurProjet(cle).fond
            const projet = projetDeVersion(cle)
            const c = couleurProjet(projet)
            if (cle.startsWith('@')) return c.fond
            const soeurs = versions.filter((v) => projetDeVersion(v.id) === projet)
            const rang = soeurs.findIndex((v) => v.id === cle)
            return melange(c.fond, c.texte, 0.12 + (0.5 * Math.max(0, rang)) / Math.max(1, soeurs.length - 1 || 1))
          }}
          nom={(cle, par) => (par === 'projet' ? titre(baseProjets, cle) : cle.startsWith('@') ? `${titre(baseProjets, cle.slice(1))} (sans ${nomVersion})` : titre(baseVersions, cle))}
          niveauProjet={nomProjet}
          niveauVersion={nomVersion}
          jalons={jalonsDe}
          nomVersion={(id) => titre(baseVersions, id)}
          aujourdhui={aujourdhui}
        />
      )}

      {detail &&
        (() => {
          const c = charge.get(detail.ressource)?.[detail.i]
          if (!c) return null
          const a = r.affectations!
          const ici = maille === 'semaine' ? 'cette semaine' : maille === 'mois' ? 'ce mois' : 'ce jour'
          const ids = c.affectations.filter((id) => !detail.bloc || dansBloc(id, detail.bloc))
          const lignesCase = ids.flatMap((id) => affectations.find((x) => x.id === id) ?? [])
          // Une affectation qui déborde de la case : la valeur vaut pour la case seule (elle est coupée autour) ou pour toute l'affectation.
          const deborde = lignesCase.some((l) => {
            const d = l.cellules[a.debut]
            const f = l.cellules[a.fin] ?? d
            const debut = d?.etat === 'ok' ? jourDe(d.valeur) : null
            const fin = f?.etat === 'ok' ? jourDe(f.valeur) : debut
            return (debut !== null && debut < c.debut) || (fin !== null && fin > c.fin)
          })
          const surLaCase = portee === 'periode' && deborde
          const ajuster = (l: LigneChargee, v: number) => {
            const morceaux = ajusterSurPeriode(r, l, c, v)
            if (!morceaux) return
            const valeurs = morceaux.map((m) => ({
              [a.debut]: m.debut,
              [a.fin]: m.fin,
              ...(m.total !== undefined ? { [a.total!]: m.total, [a.jours]: undefined } : { [a.jours]: m.jours, ...(a.total ? { [a.total]: undefined } : {}) }),
            }))
            void lancer(espace.decouperLigne(a.base, l.chemin, valeurs))
          }
          return (
            <Flottant ancre={detail.ancre} fermer={() => setDetail(null)}>
              <div className="detail-charge">
                <div className="discret">
                  {titre(base, detail.ressource)}, {maille === 'semaine' ? `semaine du ${libelleJour(c.debut)}` : maille === 'mois' ? libellePeriode('mois', c) : libelleJour(c.debut)} : {fmt(c.charge)} j sur {fmt(c.capacite)} j
                </div>
                {!lecture && deborde && (
                  <div className="bascule-charge portee-charge" role="radiogroup" aria-label="Appliquer à">
                    {(
                      [
                        ['periode', ici.charAt(0).toUpperCase() + ici.slice(1)],
                        ['tout', 'Toute l’affectation'],
                      ] as const
                    ).map(([p, nom]) => (
                      <button key={p} role="radio" aria-checked={portee === p} className={portee === p ? 'actif' : ''} onClick={() => setPortee(p)}>
                        {nom}
                      </button>
                    ))}
                  </div>
                )}
                {ids.map((id) => {
                  const l = affectations.find((x) => x.id === id)
                  const auTotal = a.total !== undefined && l?.cellules[a.total]?.etat === 'ok'
                  const cle = auTotal ? a.total! : a.jours
                  const cellule = l?.cellules[cle]
                  const valeur = surLaCase ? String(Math.round((c.parAffectation[id] ?? 0) * 100) / 100) : cellule?.etat === 'ok' ? String(cellule.valeur) : ''
                  const unite = surLaCase ? `j ${ici}` : auTotal ? 'j au total' : 'j / sem.'
                  return (
                    <div key={id} className="affectation-charge">
                      <button
                        className="lien-charge"
                        onClick={() => {
                          setDetail(null)
                          ouvrirPage(a.base, id)
                        }}
                      >
                        {titre(a.base, id)}
                      </button>
                      {!lecture && l ? (
                        <label className="jours-charge">
                          <input
                            key={`${portee}-${valeur}`}
                            type="number"
                            min={0}
                            step={maille === 'jour' ? 0.1 : 0.5}
                            aria-label={surLaCase ? `Jours ${ici}` : auTotal ? 'Jours au total' : 'Jours par semaine'}
                            defaultValue={valeur}
                            onBlur={(e) => {
                              if (e.target.value === valeur) return
                              const v = e.target.value === '' ? undefined : Number(e.target.value.replace(',', '.'))
                              if (v !== undefined && !Number.isFinite(v)) return
                              if (surLaCase) ajuster(l, v ?? 0)
                              else void lancer(espace.modifierLignes(a.base, [l.chemin], cle, v))
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                          {unite}
                        </label>
                      ) : (
                        <span className="discret">{valeur ? `${valeur} ${unite}` : ''}</span>
                      )}
                    </div>
                  )
                })}
                {ids.length === 0 && <div className="discret">Plus aucune affectation sur {ici}.</div>}
              </div>
            </Flottant>
          )
        })()}

      {choixProjet && (
        <Flottant
          ancre={choixProjet.ancre}
          fermer={() => {
            setChoixProjet(null)
            setSelection(null)
          }}
        >
          <div className="option discret">
            Affecter {titre(base, choixProjet.s.ressource)} du {libelleJour(colonnes[Math.min(choixProjet.s.de, choixProjet.s.a)]!.debut)} au {libelleJour(colonnes[Math.max(choixProjet.s.de, choixProjet.s.a)]!.fin)} à :
          </div>
          {projets.length === 0 && <div className="option discret">Aucun projet dans la base liée.</div>}
          {projets.map((p) => (
            <button key={p.id} className="option" onClick={() => void creerAffectation(choixProjet.s, p.id)}>
              {titre(baseProjets, p.id)}
            </button>
          ))}
        </Flottant>
      )}
    </div>
  )
}

/**
 * « Graphique » : une barre par période, empilée par projet (ou par version),
 * la capacité des ressources choisies en trait par-dessus (spec §21).
 */
function GraphiqueCharge(p: {
  maille: Maille
  colonnes: Periode[]
  charge: ReadonlyMap<string, readonly CaseCharge[]>
  ressources: readonly LigneChargee[]
  roles: string[]
  roleDe: (l: LigneChargee) => string | null
  versions: boolean
  ordreProjets: string[]
  ordreVersions: string[]
  couleur: (cle: string, par: 'projet' | 'version') => string
  nom: (cle: string, par: 'projet' | 'version') => string
  jalons: (p: Periode) => { id: string; date: string }[]
  nomVersion: (id: string) => string
  niveauProjet: string
  niveauVersion: string
  aujourdhui: string
}) {
  const [role, setRole] = useState(TOUS)
  const [par, setPar] = useState<'projet' | 'version'>('projet')
  const ids = p.ressources.filter((l) => role === TOUS || p.roleDe(l) === role).map((l) => l.id)
  const donnees = empiler(p.charge, ids, p.colonnes.length, p.versions ? par : 'projet')
  const parEffectif = p.versions ? par : 'projet'
  // Ordre d'empilement : projets dans l'ordre de leur base ; en versions, chaque projet puis ses versions.
  const rang = (cle: string) => {
    if (parEffectif === 'projet') return cle === '' ? 1e9 : p.ordreProjets.indexOf(cle)
    return cle.startsWith('@') ? 1e6 + p.ordreProjets.indexOf(cle.slice(1)) : p.ordreVersions.indexOf(cle)
  }
  const cles = [...new Set(donnees.flatMap((d) => Object.keys(d.parts)))].sort((a, b) => rang(a) - rang(b))
  const max = Math.max(1, ...donnees.map((d) => Math.max(d.capacite, Object.values(d.parts).reduce((x, y) => x + y, 0)))) * 1.08
  const largeurBarre = p.maille === 'jour' ? 22 : p.maille === 'mois' ? 56 : 38
  const pas = largeurBarre + (p.maille === 'jour' ? 8 : 16)
  const marge = { gauche: 40, haut: 12, bas: 40 }
  const hauteur = 240
  const largeur = marge.gauche + p.colonnes.length * pas + 8
  const y = (v: number) => marge.haut + (hauteur - marge.haut - marge.bas) * (1 - v / max)
  const graduations = [0, max / 2 / 1.08, max / 1.08].map((v) => arrondiJours(v))
  const totaux = new Map(cles.map((c) => [c, donnees.reduce((s, d) => s + (d.parts[c] ?? 0), 0)]))
  const capacite = donnees.map((d, i) => `${i === 0 ? 'M' : 'L'}${marge.gauche + i * pas + 4} ${y(d.capacite)} H${marge.gauche + i * pas + 4 + largeurBarre}`).join(' ')

  return (
    <div className="graphique-charge">
      <div className="reglages-graphique">
        {p.roles.length > 0 && (
          <Choix
            valeur={role}
            entrees={[{ valeur: TOUS, libelle: 'Tous les rôles' }, ...p.roles.map((r) => ({ valeur: r, libelle: r }))]}
            libelle="Rôle"
            changer={setRole}
          />
        )}
        {p.versions && (
          <div className="bascule-charge" role="radiogroup" aria-label="Empiler par">
            <button role="radio" aria-checked={par === 'projet'} className={par === 'projet' ? 'actif' : ''} onClick={() => setPar('projet')}>
              Par {p.niveauProjet}
            </button>
            <button role="radio" aria-checked={par === 'version'} className={par === 'version' ? 'actif' : ''} onClick={() => setPar('version')}>
              Par {p.niveauVersion}
            </button>
          </div>
        )}
      </div>
      <div className="grille-charge-defilement">
        <svg width={largeur} height={hauteur} role="img" aria-label="Charge empilée par période">
          {graduations.map((g) => (
            <g key={g}>
              <line x1={marge.gauche - 4} x2={largeur} y1={y(g)} y2={y(g)} className="ligne-graduation" />
              <text x={marge.gauche - 8} y={y(g) + 4} textAnchor="end" className="texte-graduation">
                {nombre(g)}
              </text>
            </g>
          ))}
          {donnees.map((d, i) => {
            const x = marge.gauche + i * pas + 4
            let haut = 0
            const periode = p.colonnes[i]!
            const ici = p.jalons(periode)
            return (
              <g key={periode.debut}>
                {cles.map((c) => {
                  const v = d.parts[c] ?? 0
                  if (v <= 0) return null
                  const y1 = y(haut + v)
                  const y0 = y(haut)
                  haut += v
                  return (
                    <rect key={c} x={x} y={y1} width={largeurBarre} height={Math.max(0, y0 - y1)} fill={p.couleur(c, parEffectif)} className="segment-charge">
                      <title>{`${p.nom(c, parEffectif)} : ${nombre(v)} j`}</title>
                    </rect>
                  )
                })}
                <text x={x + largeurBarre / 2} y={hauteur - marge.bas + 16} textAnchor="middle" className={`texte-periode ${periode.debut <= p.aujourdhui && p.aujourdhui <= periode.fin ? 'courante' : ''}`}>
                  {libellePeriode(p.maille, periode)}
                </text>
                {ici.length > 0 && (
                  <path d={`M${x + largeurBarre / 2} ${hauteur - marge.bas + 22} l4 4 l-4 4 l-4 -4 z`} className="jalon-graphique">
                    <title>{ici.map((j) => `${p.nomVersion(j.id)} : ${libelleJour(j.date)}`).join('\n')}</title>
                  </path>
                )}
              </g>
            )
          })}
          <path d={capacite} className="trait-capacite">
            <title>Capacité</title>
          </path>
        </svg>
      </div>
      <ul className="legende-graphique">
        {cles.map((c) => (
          <li key={c}>
            <span className="pastille-graphique" style={{ background: p.couleur(c, parEffectif) }} />
            {p.nom(c, parEffectif)}
            <span className="discret"> {nombre(totaux.get(c) ?? 0)} j</span>
          </li>
        ))}
        <li>
          <span className="trait-legende" />
          Capacité
        </li>
      </ul>
    </div>
  )
}

/** « Par projet » : chaque besoin comparé à ce qui est affecté avant sa date (spec §21). */
function ParProjet(p: {
  r: ReglagesCharge
  ressources: readonly LigneChargee[]
  affectations: readonly LigneChargee[]
  besoins: readonly LigneChargee[]
  titre: (base: string | undefined, id: string) => string
  baseProjets: string | undefined
}) {
  if (!p.r.besoins) return <p className="discret">Choisis la base des besoins dans « Options » : pour chaque projet, combien de jours de quel rôle, et avant quand.</p>
  const couvertures = couvrirBesoins(p.r, p.ressources, p.affectations, p.besoins)
  const parProjet = new Map<string, typeof couvertures>()
  for (const c of couvertures) parProjet.set(c.projet ?? '', [...(parProjet.get(c.projet ?? '') ?? []), c])
  if (parProjet.size === 0) return <p className="discret">Aucun besoin pour l’instant.</p>
  return (
    <div className="projets-charge">
      {[...parProjet].map(([projet, liste]) => (
        <section key={projet} className="projet-couverture">
          <h3>{projet ? p.titre(p.baseProjets, projet) : 'Sans projet'}</h3>
          <ul>
            {liste.map((c) => {
              const manque = c.demandes - c.affectes
              return (
                <li key={c.besoin} className={manque > 0.25 ? 'manque' : 'couvert'}>
                  <span className="role-couverture">{c.role ?? 'Tout rôle'}</span>
                  <span className="discret">{c.avant ? `avant le ${libelleJour(c.avant)}` : 'sans date'}</span>
                  <span className="jauge-couverture" aria-hidden>
                    <span style={{ width: `${Math.min(100, c.demandes > 0 ? (c.affectes / c.demandes) * 100 : 100)}%` }} />
                  </span>
                  <span className="chiffres-couverture">
                    {nombre(c.affectes)} / {nombre(c.demandes)} j
                  </span>
                  <span className="etat-couverture">{manque > 0.25 ? `il manque ${nombre(manque)} j` : 'couvert'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
