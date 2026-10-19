import { Fragment, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LigneChargee } from '../core/base'
import { arrondiJours, calculerCharge, capaciteDe, couvrirBesoins, etatCase, roleDe, semaines, type CaseCharge, type ReglagesCharge } from '../core/charge'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import { colonne as colonneDe } from '../core/schema'
import { decaler, MOIS_COURTS } from '../core/temps'
import type { ModificationVue, Vue } from '../core/vue'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { useConsultation } from './mode'
import { useAujourdhui } from './useAujourdhui'

// Plan de charge (spec §21) : la base des ressources en grille ressources ×
// semaines, chaque case la charge sur la capacité nette ; « Par projet », la
// couverture des besoins. Les chiffres viennent de `core/charge`.

type Props = {
  espace: DepotEspace
  base: string
  vue: Vue
  modifierVue: (m: ModificationVue) => void
  lignesVue: LigneVue[]
  ouvrirPage: (base: string, id: string) => void
}

const nombre = (n: number) => String(arrondiJours(n)).replace('.', ',')
const libelleSemaine = (lundi: string) => `${Number(lundi.slice(8, 10))} ${MOIS_COURTS[Number(lundi.slice(5, 7)) - 1]}`
const SANS_GROUPE = '\u0000'

/** Glisser sur les cases d'une ligne : la ressource et la plage de semaines choisies. */
type Selection = { ressource: string; de: number; a: number }

export function PlanCharge({ espace, base, vue, lignesVue, ouvrirPage }: Props) {
  const { etat } = useEspace()
  const lecture = useConsultation()
  const lancer = useLancer()
  const aujourdhui = useAujourdhui()
  const [decalage, setDecalage] = useState(0)
  const [mode, setMode] = useState<'ressources' | 'projets'>('ressources')
  const [ouvertes, setOuvertes] = useState<ReadonlySet<string>>(new Set())
  const [detail, setDetail] = useState<{ ancre: HTMLElement; ressource: string; c: CaseCharge } | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [choixProjet, setChoixProjet] = useState<{ ancre: HTMLElement; s: Selection } | null>(null)
  const glisse = useRef(false)

  const r: ReglagesCharge = vue
  const n = vue.semaines ?? 12
  const lundis = useMemo(() => semaines(decaler(aujourdhui, decalage * 7 - 7), n), [aujourdhui, decalage, n])
  const lignesDe = (id: string | undefined) => (id ? (etat.bases.get(id)?.depot?.lignes() ?? []) : [])
  const affectations = lignesDe(r.affectations?.base)
  const absences = lignesDe(r.absences?.base)
  const besoins = lignesDe(r.besoins?.base)
  const ressources = useMemo(() => lignesVue.map((lv) => lv.ligne), [lignesVue])
  const charge = useMemo(() => calculerCharge(r, ressources, affectations, absences, lundis), [r, ressources, affectations, absences, lundis])

  const schema = etat.bases.get(base)?.depot?.schema
  const schemaAff = r.affectations ? etat.bases.get(r.affectations.base)?.depot?.schema : undefined
  const colProjet = schemaAff && r.affectations ? colonneDe(schemaAff, r.affectations.projet) : undefined
  const baseProjets = colProjet?.type === 'relation' ? colProjet.cible : undefined
  const titre = (b: string | undefined, id: string) => (b && etat.titres.get(b)?.get(id)) || id || 'Sans projet'

  if (!r.affectations || !schemaAff) {
    return <p className="discret">Choisis la base des affectations dans « Options » : qui travaille sur quel projet, de quand à quand, combien de jours par semaine.</p>
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
    const ia = a === SANS_GROUPE ? 1e9 : ordreGroupes.indexOf(a) === -1 ? 1e8 : ordreGroupes.indexOf(a)
    const ib = b === SANS_GROUPE ? 1e9 : ordreGroupes.indexOf(b) === -1 ? 1e8 : ordreGroupes.indexOf(b)
    return ia - ib || a.localeCompare(b)
  })

  const basculer = (id: string) => setOuvertes((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set([...o, id])))

  const finirGlisse = (ancre: HTMLElement) => {
    if (!glisse.current || !selection) return
    glisse.current = false
    setChoixProjet({ ancre, s: selection })
  }

  const creerAffectation = async (s: Selection, projet: string) => {
    setChoixProjet(null)
    setSelection(null)
    const a = r.affectations!
    const [de, jusqua] = s.de <= s.a ? [s.de, s.a] : [s.a, s.de]
    const res = ressources.find((l) => l.id === s.ressource)
    const cases = charge.get(s.ressource)?.slice(de, jusqua + 1) ?? []
    const restante = Math.max(0.5, arrondiJours(Math.min(...cases.map((c) => (c.ouvres > 0 ? ((c.capacite - c.charge) * 5) / c.ouvres : capaciteDe(r, res!))))))
    const titreAff = `${titre(base, s.ressource)} sur ${titre(baseProjets, projet)}`
    const titreCle = schemaAff.champTitre
    await lancer(
      espace.creerLigne(a.base, {
        [titreCle]: titreAff,
        [a.ressource]: [s.ressource],
        [a.projet]: [projet],
        [a.debut]: lundis[de]!,
        [a.fin]: decaler(lundis[jusqua]!, 4),
        [a.jours]: Math.min(restante, capaciteDe(r, res!)),
      }),
    )
  }

  const projets = baseProjets ? (etat.bases.get(baseProjets)?.depot?.lignes() ?? []) : []
  const dansSelection = (ressource: string, i: number) => selection?.ressource === ressource && i >= Math.min(selection.de, selection.a) && i <= Math.max(selection.de, selection.a)

  return (
    <div className="plan-charge">
      <div className="barre-charge">
        <div className="bascule-charge" role="tablist">
          <button role="tab" aria-selected={mode === 'ressources'} className={mode === 'ressources' ? 'actif' : ''} onClick={() => setMode('ressources')}>
            Par ressource
          </button>
          <button role="tab" aria-selected={mode === 'projets'} className={mode === 'projets' ? 'actif' : ''} onClick={() => setMode('projets')}>
            Par projet
          </button>
        </div>
        {mode === 'ressources' && (
          <div className="navigation-charge">
            <button className="discret" aria-label="Semaines précédentes" onClick={() => setDecalage((d) => d - 4)}>
              <Icone de={ChevronLeft} />
            </button>
            <button className="discret" onClick={() => setDecalage(0)}>
              Aujourd’hui
            </button>
            <button className="discret" aria-label="Semaines suivantes" onClick={() => setDecalage((d) => d + 4)}>
              <Icone de={ChevronRight} />
            </button>
          </div>
        )}
        <div className="legende-charge discret">
          <span className="charge-libre" /> libre
          <span className="charge-pleine" /> pleine
          <span className="charge-surchargee" /> surchargée
          <span className="charge-absente" /> absente
        </div>
      </div>

      {mode === 'ressources' ? (
        <div className="grille-charge-defilement">
          <table className="grille-charge" onPointerLeave={() => !glisse.current && setSelection(null)}>
            <thead>
              <tr>
                <th className="nom-charge">Ressource</th>
                {lundis.map((l) => (
                  <th key={l} className={l <= aujourdhui && aujourdhui < decaler(l, 7) ? 'semaine-courante' : ''}>
                    {libelleSemaine(l)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cles.map((g) => {
                const lignes = groupes.get(g)!
                return (
                  <Fragment key={g}>
                    {colGroupe && (
                      <tr className="groupe-charge">
                        <th className="nom-charge">
                          {g === SANS_GROUPE ? 'Sans valeur' : g}
                          <span className="discret"> {lignes.length}</span>
                        </th>
                        {lundis.map((l, i) => {
                          const cases = lignes.map((res) => charge.get(res.id)![i]!)
                          const total = cases.reduce((s, c) => s + c.charge, 0)
                          const cap = cases.reduce((s, c) => s + c.capacite, 0)
                          return (
                            <td key={l} className="total-charge">
                              {total > 0 ? `${nombre(total)} / ${nombre(cap)}` : ''}
                            </td>
                          )
                        })}
                      </tr>
                    )}
                    {lignes.map((res) => {
                      const cases = charge.get(res.id)!
                      const ouverte = ouvertes.has(res.id)
                      const projetsDeLaLigne = [...new Set(cases.flatMap((c) => Object.keys(c.parProjet)))]
                      return (
                        <Fragment key={res.id}>
                          <tr className="ressource-charge">
                            <th className="nom-charge">
                              <button className="discret deplier-charge" aria-label={ouverte ? 'Replier' : 'Déplier par projet'} aria-expanded={ouverte} disabled={projetsDeLaLigne.length === 0} onClick={() => basculer(res.id)}>
                                <Icone de={ChevronRight} className={ouverte ? 'tourne' : ''} />
                              </button>
                              <button className="lien-charge" onClick={() => ouvrirPage(base, res.id)}>
                                {titre(base, res.id)}
                              </button>
                            </th>
                            {cases.map((c, i) => {
                              const e = etatCase(c)
                              return (
                                <td
                                  key={c.lundi}
                                  className={`case-charge charge-${e} ${dansSelection(res.id, i) ? 'selection' : ''}`}
                                  title={`${nombre(c.charge)} j sur ${nombre(c.capacite)} j${c.absence ? `, ${c.absence} j d’absence` : ''}`}
                                  onPointerDown={(ev) => {
                                    if (lecture || ev.button !== 0) return
                                    glisse.current = true
                                    setSelection({ ressource: res.id, de: i, a: i })
                                  }}
                                  onPointerEnter={() => glisse.current && selection?.ressource === res.id && setSelection({ ...selection, a: i })}
                                  onPointerUp={(ev) => {
                                    const s = selection
                                    if (glisse.current && s && s.de === s.a) {
                                      glisse.current = false
                                      setSelection(null)
                                      if (c.affectations.length > 0) setDetail({ ancre: ev.currentTarget, ressource: res.id, c })
                                      else if (!lecture) setChoixProjet({ ancre: ev.currentTarget, s })
                                      return
                                    }
                                    finirGlisse(ev.currentTarget)
                                  }}
                                >
                                  {e === 'absente' || e === 'vide' ? '' : `${nombre(c.charge)} / ${nombre(c.capacite)}`}
                                </td>
                              )
                            })}
                          </tr>
                          {ouverte &&
                            projetsDeLaLigne.map((p) => (
                              <tr key={p} className="projet-charge">
                                <th className="nom-charge">{titre(baseProjets, p)}</th>
                                {cases.map((c) => (
                                  <td key={c.lundi}>{c.parProjet[p] ? nombre(c.parProjet[p]) : ''}</td>
                                ))}
                              </tr>
                            ))}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {!lecture && <p className="discret aide-charge">Glisse sur les semaines d’une ressource pour l’affecter à un projet ; clique une case pour voir ce qui la compose.</p>}
        </div>
      ) : (
        <ParProjet r={r} ressources={ressources} affectations={affectations} besoins={besoins} titre={titre} baseProjets={baseProjets} />
      )}

      {detail && (
        <Flottant ancre={detail.ancre} fermer={() => setDetail(null)}>
          <div className="detail-charge">
            <div className="discret">
              {titre(base, detail.ressource)}, semaine du {libelleSemaine(detail.c.lundi)} : {nombre(detail.c.charge)} j sur {nombre(detail.c.capacite)} j
            </div>
            {detail.c.affectations.map((id) => {
              const l = affectations.find((x) => x.id === id)
              const a = r.affectations!
              const jours = l?.cellules[a.jours]
              return (
                <div key={id} className="affectation-charge">
                  <button className="lien-charge" onClick={() => {
                      setDetail(null)
                      ouvrirPage(a.base, id)
                    }}>
                    {titre(a.base, id)}
                  </button>
                  {!lecture && l ? (
                    <label className="jours-charge">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label="Jours par semaine"
                        defaultValue={jours?.etat === 'ok' ? String(jours.valeur) : ''}
                        onBlur={(e) => {
                          const v = e.target.value === '' ? undefined : Number(e.target.value)
                          if (v === undefined || Number.isFinite(v)) void lancer(espace.modifierLignes(a.base, [l.chemin], a.jours, v))
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                      j / sem.
                    </label>
                  ) : (
                    <span className="discret">{jours?.etat === 'ok' ? `${String(jours.valeur)} j / sem.` : ''}</span>
                  )}
                </div>
              )
            })}
          </div>
        </Flottant>
      )}

      {choixProjet && (
        <Flottant
          ancre={choixProjet.ancre}
          fermer={() => {
            setChoixProjet(null)
            setSelection(null)
          }}
        >
          <div className="option discret">
            Affecter {titre(base, choixProjet.s.ressource)} du {libelleSemaine(lundis[Math.min(choixProjet.s.de, choixProjet.s.a)]!)} au {libelleSemaine(decaler(lundis[Math.max(choixProjet.s.de, choixProjet.s.a)]!, 4))} à :
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
                  <span className="discret">{c.avant ? `avant le ${Number(c.avant.slice(8, 10))} ${MOIS_COURTS[Number(c.avant.slice(5, 7)) - 1]}` : 'sans date'}</span>
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
