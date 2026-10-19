import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BlocAnalyse, EntreeEtat } from '../core/bi/analyse'
import { couleurJours, etatDe, fenetreFrise, grilleEtapes, jourDe, joursJusqua, moisDe, position, prochaine, selection, SEUILS, texteDe } from '../core/bi/fiche'
import { formater } from '../core/bi/regles'
import type { ResultatSql, ValeurSql } from '../core/bi/sql'
import type { Schema } from '../core/schema'
import { couleursOptions, VIVES } from './graphiques'

// Blocs des fiches (spec §10 « Fiches ») : en-tête, compte à rebours, barres
// d'étapes, liste à pastilles, répartition, frise. La couleur ne dit qu'un
// état ; tout se lit sans survol, le survol complète.

type Tables = Readonly<Record<string, Readonly<Record<string, string>>>>
type Etats = Readonly<Record<string, readonly EntreeEtat[]>>
type Lignes = Record<string, ValeurSql>[]

/** Teinte CSS d'une couleur de fiche : couleur de l'espace (vive), hexadécimal, `vide` ou `aucune`. */
export function teinte(couleur: string | undefined): string | undefined {
  if (!couleur) return undefined
  if (couleur === 'vide') return 'var(--fiche-vide)'
  if (couleur === 'aucune') return 'transparent'
  return VIVES[couleur] ?? (couleur.startsWith('#') ? couleur : undefined)
}

/** Couleur d'une valeur par la table du bloc (nom d'une table du dashboard, ou table écrite dans le bloc). */
export function couleurParTable(valeur: ValeurSql | undefined, couleurs: BlocAnalyse['couleurs'], tables: Tables): string | undefined {
  const table = typeof couleurs === 'string' ? tables[couleurs] : couleurs
  const v = texteDe(valeur)
  return v === null ? undefined : table?.[v]
}

export function Point({ couleur, titre }: { couleur: string | undefined; titre?: string }) {
  const aucune = couleur === 'aucune'
  return <span className={`point-fiche ${aucune ? 'aucune' : ''}`} style={{ background: teinte(couleur ?? 'gris') }} title={titre} />
}

const jjmm = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`

/** Valeur d'une colonne du résultat, ou le texte du réglage s'il ne nomme pas de colonne. */
const colonneOuTexte = (ligne: Record<string, ValeurSql> | undefined, reglage: string | undefined, citer: (t: string) => string) => {
  if (!reglage) return ''
  return ligne && Object.hasOwn(ligne, reglage) ? formater(ligne[reglage]) : citer(reglage)
}

// ── En-tête ──────────────────────────────────────────────────────

export function EnteteFiche({ bloc, resultat, etats, citer }: { bloc: BlocAnalyse; resultat: ResultatSql; etats: Etats; citer: (t: string) => string }) {
  const ligne = resultat.lignes[0]
  const etat = etatDe(ligne, bloc.etat ? etats[bloc.etat] : undefined)
  return (
    <div className="entete-fiche">
      <div>
        <h2>{colonneOuTexte(ligne, bloc.titre, citer) || (ligne ? '' : 'Aucune ligne')}</h2>
        {bloc.sous_titre && <div className="discret">{colonneOuTexte(ligne, bloc.sous_titre, citer)}</div>}
      </div>
      {etat && (
        <div className="etat-fiche" title={etat.raison ? `Calculé : ${etat.raison}` : undefined}>
          <Point couleur={etat.couleur} />
          {etat.libelle}
        </div>
      )}
    </div>
  )
}

// ── Compte à rebours ─────────────────────────────────────────────

/** Liseré d'un compte à rebours : la couleur des seuils, gris sans date à venir. */
export function lisereCompte(bloc: BlocAnalyse, resultat: ResultatSql | undefined, aujourdhui: string): string {
  const p = resultat && prochaine(resultat, bloc.date ?? 'date', aujourdhui)
  return p ? teinte(couleurJours(p.jours, bloc.seuils))! : 'var(--tres-discret)'
}

export function CompteARebours({ bloc, resultat, aujourdhui }: { bloc: BlocAnalyse; resultat: ResultatSql; aujourdhui: string }) {
  const p = prochaine(resultat, bloc.date ?? 'date', aujourdhui)
  if (!p) {
    return (
      <div className="compte-a-rebours">
        <div className="jours vide">?</div>
        <div className="discret">{bloc.vide ?? 'Aucune date à venir saisie'}</div>
      </div>
    )
  }
  return (
    <div className="compte-a-rebours">
      <div className="jours" style={{ color: teinte(couleurJours(p.jours, bloc.seuils)) }}>J-{p.jours}</div>
      <div>
        {bloc.libelle ? formater(p.ligne[bloc.libelle]) : ''} <span className="discret">le {jjmm(p.jour)}</span>
      </div>
    </div>
  )
}

// ── Barres d'étapes ──────────────────────────────────────────────

export function EtapesFiche({ bloc, resultat, tables, aujourdhui }: { bloc: BlocAnalyse; resultat: ResultatSql; tables: Tables; aujourdhui: string }) {
  const { etapes, groupes } = grilleEtapes(bloc, resultat)
  if (etapes.length === 0) return <p className="discret">Aucune étape.</p>
  const colonnes = { '--etapes': etapes.length } as CSSProperties
  const table = typeof bloc.couleurs === 'string' ? tables[bloc.couleurs] : bloc.couleurs
  return (
    <div className="etapes-fiche" style={colonnes}>
      <div className="ligne-etapes bandeau">
        <div />
        <div className="cases">
          {etapes.map((e) => (
            <div key={e.nom} title={e.nom}>
              {e.court ?? e.nom}
            </div>
          ))}
        </div>
      </div>
      {groupes.map((g, i) => (
        <div key={i}>
          {g.titre !== null && (
            <div className="titre-groupe-etapes">
              {g.titre} {g.detail && <span className="discret">{g.detail}</span>}
            </div>
          )}
          {g.elements.map((el) => (
            <div key={el.nom} className="ligne-etapes">
              <div className="nom-element">{el.nom}</div>
              <div>
                <div className="cases">
                  {el.cases.map((c, k) => {
                    const couleur = (c.statut !== null ? table?.[c.statut] : undefined) ?? 'vide'
                    return (
                      <div
                        key={k}
                        className={`case-etape ${couleur === 'aucune' ? 'aucune' : ''}`}
                        style={{ background: teinte(couleur) }}
                        title={`${etapes[k]!.nom} : ${c.statut ?? 'à planifier'}${c.date ? ` · ${jjmm(c.date)}` : ''}`}
                      />
                    )
                  })}
                </div>
                <div className="cases dates-etapes">
                  {el.cases.map((c, k) => {
                    const jours = c.date ? joursJusqua(c.date, aujourdhui) : null
                    const proche = jours !== null && jours >= 0 && jours < SEUILS[1]
                    return (
                      <span key={k} style={proche ? { color: teinte(couleurJours(jours)) } : undefined}>
                        {c.date ? jjmm(c.date) : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <Legende entrees={[...Object.entries(table ?? {}), ['À planifier', 'vide']]} />
    </div>
  )
}

function Legende({ entrees, notes = [] }: { entrees: readonly (readonly [string, string])[]; notes?: string[] }) {
  return (
    <div className="legende-fiche">
      {entrees.map(([libelle, couleur]) => (
        <span key={libelle}>
          <Point couleur={couleur} />
          {libelle}
        </span>
      ))}
      {notes.map((n) => (
        <span key={n}>{n}</span>
      ))}
    </div>
  )
}

// ── Liste à pastilles ────────────────────────────────────────────

export function ListeFiche({ bloc, resultat, etats, tables }: { bloc: BlocAnalyse; resultat: ResultatSql; etats: Etats; tables: Tables }) {
  const [tout, setTout] = useState(false)
  const { gardees, ecartees } = selection(resultat, bloc.max)
  const entrees = bloc.pastille ? etats[bloc.pastille] : undefined
  const couleur = (l: Record<string, ValeurSql>) => (entrees ? etatDe(l, entrees)?.couleur : bloc.pastille ? couleurParTable(l[bloc.pastille], bloc.couleurs, tables) : undefined)
  const libelle = bloc.libelle ?? resultat.colonnes.find((c) => !c.nom.startsWith('_'))?.nom
  const ligne = (l: Record<string, ValeurSql>, i: number, ecartee = false) => (
    <div key={i} className={`ligne-liste ${ecartee ? 'ecartee' : ''}`}>
      <Point couleur={couleur(l) ?? 'gris'} />
      <span className="libelle-liste">{libelle ? formater(l[libelle]) : ''}</span>
      {bloc.detail && formater(l[bloc.detail]) && <span className="discret"> · {formater(l[bloc.detail])}</span>}
    </div>
  )
  return (
    <div className="liste-fiche">
      {gardees.length === 0 && <p className="vide-fiche">{bloc.vide ?? 'Aucune ligne'}</p>}
      {gardees.map((l, i) => ligne(l, i))}
      {tout && ecartees.map((l, i) => ligne(l, gardees.length + i, true))}
      {ecartees.length > 0 && (
        <button className="discret lien-autres" onClick={() => setTout((t) => !t)} aria-expanded={tout}>
          {tout ? 'Masquer les écartées' : `${ecartees.length} autre${ecartees.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ── Répartition ──────────────────────────────────────────────────

export function Repartition({ bloc, resultat, tables, schemas }: { bloc: BlocAnalyse; resultat: ResultatSql; tables: Tables; schemas: readonly Schema[] }) {
  const x = bloc.x ?? resultat.colonnes.find((c) => c.nature !== 'nombre')?.nom
  const y = bloc.y?.[0] ?? resultat.colonnes.find((c) => c.nature === 'nombre')?.nom
  if (!x || !y) return <p className="discret">Une colonne de catégories et une de nombres sont attendues.</p>
  const options = couleursOptions(schemas, x)
  const parts = resultat.lignes.map((l) => ({ nom: texteDe(l[x]) ?? '(vide)', n: typeof l[y] === 'number' ? (l[y] as number) : 0 })).filter((p) => p.n > 0)
  const rang = (nom: string) => {
    const i = bloc.ordre?.indexOf(nom) ?? -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  parts.sort((a, b) => rang(a.nom) - rang(b.nom))
  const palette = Object.values(VIVES)
  const couleur = (nom: string, i: number) => teinte(couleurParTable(nom, bloc.couleurs, tables)) ?? options.get(nom) ?? palette[i % palette.length]
  if (parts.length === 0) return <p className="vide-fiche">{bloc.vide ?? 'Rien à répartir'}</p>
  return (
    <div className="repartition">
      <div className="barre-repartition">
        {parts.map((p, i) => (
          <div key={p.nom} style={{ flex: p.n, background: couleur(p.nom, i) }} title={`${p.nom} : ${formater(p.n)}`} />
        ))}
      </div>
      <div className="legende-fiche">
        {parts.map((p, i) => (
          <span key={p.nom}>
            <span className="point-fiche" style={{ background: couleur(p.nom, i) }} />
            {p.nom} <b>{formater(p.n)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Frise ────────────────────────────────────────────────────────

type Bande = { ligne: string; debut: string; fin: string; categorie: string | null; previsionnel: boolean }

function useLargeur(defaut = 900) {
  const ref = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(defaut)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => e && setLargeur(Math.max(480, Math.round(e.contentRect.width))))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, largeur }
}

const HAUT_LIGNE = 26
const MARGE_GAUCHE = 150

export function Frise({ bloc, resultat, jalons, periodes, tables, aujourdhui }: { bloc: BlocAnalyse; resultat: ResultatSql; jalons: Lignes; periodes: Lignes; tables: Tables; aujourdhui: string }) {
  const { ref, largeur } = useLargeur()
  const bandes: Bande[] = resultat.lignes.flatMap((l) => {
    const debut = jourDe(l[bloc.debut ?? 'debut'])
    const fin = jourDe(l[bloc.fin ?? 'fin']) ?? debut
    return debut && fin ? [{ ligne: texteDe(l[bloc.ligne ?? 'ligne']) ?? '', debut, fin, categorie: bloc.categorie ? texteDe(l[bloc.categorie]) : null, previsionnel: bloc.previsionnel ? l[bloc.previsionnel] === true : false }] : []
  })
  const jj = jalons.flatMap((l) => {
    const jour = jourDe(l[bloc.jalons?.date ?? 'date'])
    return jour ? [{ jour, libelle: texteDe(l[bloc.jalons?.libelle ?? 'libelle']) ?? '', ligne: bloc.jalons?.ligne ? texteDe(l[bloc.jalons.ligne]) : null, couleur: bloc.jalons?.couleur ? (texteDe(l[bloc.jalons.couleur]) ?? undefined) : undefined }] : []
  })
  const pp = periodes.flatMap((l) => {
    const debut = jourDe(l[bloc.periodes?.debut ?? 'debut'])
    const fin = jourDe(l[bloc.periodes?.fin ?? 'fin'])
    return debut && fin ? [{ debut, fin, libelle: texteDe(l[bloc.periodes?.libelle ?? 'libelle']) ?? '' }] : []
  })
  if (bandes.length === 0 && jj.length === 0) return <p className="vide-fiche">{bloc.vide ?? 'Aucune période datée'}</p>
  const f = fenetreFrise([...bandes.map((b) => b.fin), ...jj.map((j) => j.jour)], aujourdhui)
  const lignes = [...new Set([...bandes.filter((b) => b.fin >= f.debut).map((b) => b.ligne), ...jj.filter((j) => j.ligne !== null && j.jour >= f.debut).map((j) => j.ligne!)])]
  if (lignes.length === 0 && !jj.some((j) => j.jour >= f.debut)) return <p className="vide-fiche">{bloc.vide ?? `Rien de prévu depuis le ${jjmm(f.debut)}`}</p>
  const hauteur = 24 + lignes.length * HAUT_LIGNE + 24
  const x = (jour: string) => MARGE_GAUCHE + position(jour, f) * (largeur - MARGE_GAUCHE - 8)
  const table = typeof bloc.couleurs === 'string' ? tables[bloc.couleurs] : bloc.couleurs
  const couleur = (c: string | null) => teinte((c !== null ? table?.[c] : undefined) ?? 'bleu')
  const categories = [...new Set(bandes.map((b) => b.categorie).filter((c): c is string => c !== null))]
  const xa = x(aujourdhui)
  return (
    <div ref={ref} className="frise">
      <svg width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label={bloc.titre ?? 'Frise'}>
        <defs>
          <pattern id="hachures-frise" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="3" height="7" fill={VIVES.rouge} fillOpacity=".28" />
          </pattern>
        </defs>
        {pp.map((p, i) => (
          <g key={`p${i}`}>
            <rect x={x(p.debut)} y={18} width={Math.max(2, x(p.fin) - x(p.debut))} height={hauteur - 32} fill="url(#hachures-frise)" stroke={VIVES.rouge} strokeOpacity=".5">
              <title>{`${p.libelle} du ${jjmm(p.debut)} au ${jjmm(p.fin)}`}</title>
            </rect>
            <text x={x(p.debut) + 3} y={hauteur - 18} className="texte-periode">
              {p.libelle}
            </text>
          </g>
        ))}
        {moisDe(f).map((m) => (
          <g key={m}>
            <line x1={x(m)} y1={0} x2={x(m)} y2={hauteur - 14} className="trait-mois" />
            <text x={x(m) + 4} y={11} className="texte-mois">
              {new Date(`${m}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).toUpperCase()}
            </text>
          </g>
        ))}
        {lignes.map((nom, i) => {
          const y = 24 + i * HAUT_LIGNE
          return (
            <g key={nom}>
              <text x={0} y={y + 12} className="texte-ligne-frise">
                {nom}
              </text>
              {bandes
                .filter((b) => b.ligne === nom && b.fin >= f.debut)
                .map((b, k) => (
                  <rect key={k} x={x(b.debut)} y={y + 2} width={Math.max(3, x(b.fin) - x(b.debut) + 3)} height={12} rx={3} fill={couleur(b.categorie)} className={b.previsionnel ? 'previsionnel' : undefined}>
                    <title>{`${b.categorie ?? nom} du ${jjmm(b.debut)} au ${jjmm(b.fin)}${b.previsionnel ? ' (prévisionnel)' : ''}`}</title>
                  </rect>
                ))}
              {jj
                .filter((j) => j.ligne === nom && j.jour >= f.debut)
                .map((j, k) => (
                  <g key={`j${k}`}>
                    <path d={`M${x(j.jour)} ${y + 1} l7 7 l-7 7 l-7 -7z`} fill={teinte(j.couleur) ?? 'var(--texte)'}>
                      <title>{`${j.libelle} le ${jjmm(j.jour)}`}</title>
                    </path>
                    <text x={x(j.jour) + 10} y={y + 12} className="texte-jalon">
                      {j.libelle ? `${j.libelle} ${jjmm(j.jour)}` : jjmm(j.jour)}
                    </text>
                  </g>
                ))}
            </g>
          )
        })}
        {jj
          .filter((j) => j.ligne === null && j.jour >= f.debut)
          .map((j, k) => (
            <path key={`jt${k}`} d={`M${x(j.jour)} 14 l5 5 l-5 5 l-5 -5z`} fill={teinte(j.couleur ?? 'rouge')}>
              <title>{`${j.libelle} le ${jjmm(j.jour)}`}</title>
            </path>
          ))}
        <line x1={xa} y1={14} x2={xa} y2={hauteur - 14} className="trait-aujourdhui" />
        <text x={xa} y={hauteur - 2} className="texte-aujourdhui">
          AUJ.
        </text>
      </svg>
      <Legende entrees={categories.map((c) => [c, (table?.[c] ?? 'bleu')] as const)} notes={bandes.some((b) => b.previsionnel) ? ['Contour pointillé : prévisionnel'] : []} />
    </div>
  )
}
