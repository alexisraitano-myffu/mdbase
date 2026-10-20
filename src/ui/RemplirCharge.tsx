import { useEffect, useMemo, useState } from 'react'
import { ListRestart, Plus, X } from 'lucide-react'
import type { LigneChargee } from '../core/base'
import { besoinsAPlacer, ligneApercu, remplir, type LigneRemplissage, type ModeRemplissage, type OptionsCalcul, type ReglagesCharge, type Remplissage } from '../core/charge'
import type { DepotEspace } from '../core/depot-espace'
import { decaler, MOIS_COURTS } from '../core/temps'
import { useLancer } from './actions'
import { Choix } from './Choix'
import { Icone } from './icones'

// « Remplir » du plan de charge (spec §21) : placer les jours d'un projet, une
// ligne par rôle (pré-remplies depuis ses besoins), dans la capacité libre de
// la situation affichée. L'aperçu se voit aussitôt dans la grille (lignes
// d'aperçu remontées par `apercu`) ; « Créer » écrit les affectations dans un
// scénario, en une étape d'annulation.

const NOUVEAU = '\u0000nouveau'
const TOUS = ''

type Props = {
  espace: DepotEspace
  r: ReglagesCharge
  ressources: readonly LigneChargee[]
  affectations: readonly LigneChargee[]
  absences: readonly LigneChargee[]
  besoins: readonly LigneChargee[]
  options: OptionsCalcul
  projets: { id: string; titre: string }[]
  versionsDe: (projet: string) => { id: string; titre: string }[]
  roles: string[]
  scenarios: string[]
  nomProjet: string
  nomVersion: string
  titreRessource: (id: string) => string
  titreMoratoire: (id: string) => string
  champTitre: string
  aujourdhui: string
  apercu: (lignes: LigneChargee[]) => void
  fermer: () => void
  /** Après création : le scénario où les affectations ont été écrites (null : plan réel). */
  cree: (scenario: string | null) => void
}

/** Une ligne en saisie : les jours restent du texte tant qu'on tape. */
type Saisie = { role: string; jours: string; debut: string; fin: string }

/** Premier nom libre de la forme « Option A », « Option B »… */
function nomLibre(pris: readonly string[]): string {
  for (let i = 0; i < 26; i++) {
    const nom = `Option ${String.fromCharCode(65 + i)}`
    if (!pris.includes(nom)) return nom
  }
  return `Option ${pris.length + 1}`
}

const jours = (n: number) => String(n).replace('.', ',')
const date = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS_COURTS[Number(iso.slice(5, 7)) - 1]}`
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function RemplirCharge(p: Props) {
  const lancer = useLancer()
  const a = p.r.affectations!
  const finParDefaut = decaler(p.aujourdhui, 27)
  const vierge = (): Saisie => ({ role: p.roles[0] ?? TOUS, jours: '10', debut: p.aujourdhui, fin: finParDefaut })
  const [projet, setProjet] = useState(p.projets[0]?.id ?? '')
  const [version, setVersion] = useState('')
  const [mode, setMode] = useState<ModeRemplissage>('tot')
  const [scenario, setScenario] = useState(a.scenario ? (p.scenarios[0] ?? NOUVEAU) : '')
  const [nouveau, setNouveau] = useState(() => nomLibre(p.scenarios))
  const versions = projet && a.version ? p.versionsDe(projet) : []
  const nomScenario = scenario === NOUVEAU ? nouveau.trim() : scenario
  const { scenario: affiche = null, moratoires, phases } = p.options

  /** Les lignes d'après les besoins du projet (ce qui manque, dans leur fenêtre), sinon une ligne vierge. */
  const depuisBesoins = (id: string): Saisie[] => {
    const l = id ? besoinsAPlacer(p.r, p.ressources, p.affectations, p.besoins, id, p.aujourdhui, finParDefaut, { scenario: affiche, moratoires, phases }) : []
    return l.length > 0 ? l.map((x) => ({ role: x.role ?? TOUS, jours: String(x.jours), debut: x.debut, fin: x.fin })) : [vierge()]
  }
  const [saisies, setSaisies] = useState<Saisie[]>(() => depuisBesoins(projet))
  const changerLigne = (i: number, m: Partial<Saisie>) => setSaisies((t) => t.map((x, k) => (k === i ? { ...x, ...m } : x)))

  const lignes: LigneRemplissage[] = useMemo(
    () =>
      saisies.flatMap((x) => {
        const n = Number(x.jours.replace(',', '.'))
        return Number.isFinite(n) && n > 0 ? [{ role: x.role || null, jours: n, debut: x.debut, fin: x.fin }] : []
      }),
    [saisies],
  )
  const resultat: Remplissage = useMemo(
    () =>
      projet && lignes.length > 0
        ? remplir(p.r, p.ressources, p.affectations, p.absences, { projet, version: version || null, mode, scenario: nomScenario || null, lignes }, { scenario: affiche, moratoires, phases })
        : { affectations: [], lignes: [], places: 0, manque: 0 },
    [p.r, p.ressources, p.affectations, p.absences, affiche, moratoires, phases, projet, version, mode, nomScenario, lignes],
  )
  const { apercu } = p
  useEffect(() => {
    apercu(resultat.affectations.map((x, i) => ligneApercu(`apercu-${i}`, x.valeurs)))
  }, [resultat, apercu])

  const creer = async () => {
    const titre = p.projets.find((x) => x.id === projet)?.titre ?? projet
    await lancer(
      p.espace.enUneEtape(async () => {
        if (a.scenario && nomScenario && !p.scenarios.includes(nomScenario)) await p.espace.ajouterOption(a.base, a.scenario, nomScenario)
        for (const x of resultat.affectations) await p.espace.creerLigne(a.base, { [p.champTitre]: `${p.titreRessource(x.ressource)} sur ${titre}`, ...x.valeurs })
      }),
    )
    p.cree(a.scenario && nomScenario ? nomScenario : null)
  }

  // Le résultat de chaque saisie : les lignes vides (sans jours) n'en ont pas.
  let rang = 0
  const resultatDe = saisies.map((x) => {
    const n = Number(x.jours.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? resultat.lignes[rang++] : undefined
  })

  return (
    <section className="remplir-charge" aria-label="Remplir">
      <div className="entete-remplir">
        <strong>Remplir</strong>
        <span className="discret">placer des jours dans la capacité libre, rôle par rôle</span>
        <button className="discret" aria-label="Fermer" onClick={p.fermer}>
          <Icone de={X} />
        </button>
      </div>
      <div className="champs-remplir">
        <label>
          <span>{majuscule(p.nomProjet)}</span>
          <Choix
            valeur={projet}
            entrees={p.projets.map((x) => ({ valeur: x.id, libelle: x.titre }))}
            vide="choisir"
            libelle={`Remplir : ${p.nomProjet}`}
            changer={(v) => {
              setProjet(v)
              setVersion('')
              setSaisies(depuisBesoins(v))
            }}
          />
        </label>
        {a.version && (
          <label>
            <span>{majuscule(p.nomVersion)}</span>
            <Choix valeur={version} entrees={[{ valeur: '', libelle: 'aucune' }, ...versions.map((x) => ({ valeur: x.id, libelle: x.titre }))]} libelle={`Remplir : ${p.nomVersion}`} changer={setVersion} />
          </label>
        )}
        <div className="bascule-charge" role="radiogroup" aria-label="Mode de remplissage">
          {(
            [
              ['tot', 'Au plus tôt'],
              ['lisse', 'Lissé'],
            ] as const
          ).map(([m, nom]) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'actif' : ''} onClick={() => setMode(m)}>
              {nom}
            </button>
          ))}
        </div>
        {a.scenario && (
          <label>
            <span>Scénario</span>
            <span className="scenario-remplir">
              <Choix valeur={scenario} entrees={[...p.scenarios.map((x) => ({ valeur: x, libelle: x })), { valeur: NOUVEAU, libelle: 'Nouveau scénario' }]} libelle="Remplir : scénario" changer={setScenario} />
              {scenario === NOUVEAU && <input className="nom-scenario" value={nouveau} aria-label="Nom du scénario" onChange={(e) => setNouveau(e.target.value)} />}
            </span>
          </label>
        )}
      </div>

      <div className="lignes-remplir" role="list" aria-label="Lignes à placer">
        {saisies.map((x, i) => {
          const res = resultatDe[i]
          return (
            <div key={i} className="ligne-remplir" role="listitem">
              {p.roles.length > 0 && (
                <Choix valeur={x.role} entrees={[{ valeur: TOUS, libelle: 'tous les rôles' }, ...p.roles.map((r) => ({ valeur: r, libelle: r }))]} libelle={`Ligne ${i + 1} : rôle`} changer={(v) => changerLigne(i, { role: v })} />
              )}
              <input className="jours-remplir" type="number" min={0} step={0.5} value={x.jours} aria-label={`Ligne ${i + 1} : jours`} onChange={(e) => changerLigne(i, { jours: e.target.value })} />
              <span className="discret">j du</span>
              <input type="date" value={x.debut} aria-label={`Ligne ${i + 1} : du`} onChange={(e) => e.target.value && changerLigne(i, { debut: e.target.value })} />
              <span className="discret">au</span>
              <input type="date" value={x.fin} aria-label={`Ligne ${i + 1} : au`} onChange={(e) => e.target.value && changerLigne(i, { fin: e.target.value })} />
              <span className="resultat-ligne">
                {res &&
                  (res.places > 0 ? `${jours(res.places)} j placés${res.finTravail ? `, fini le ${date(res.finTravail)}` : ''}` : 'rien de libre')}
                {res && res.manque > 0 && <span className="danger-texte">{`, il manque ${jours(res.manque)} j`}</span>}
                {res?.gel && <span className="discret">{` (fin ramenée au ${date(res.fin)} : ${p.titreMoratoire(res.gel)})`}</span>}
              </span>
              <button className="discret" aria-label={`Retirer la ligne ${i + 1}`} disabled={saisies.length === 1} onClick={() => setSaisies((t) => t.filter((_, k) => k !== i))}>
                <Icone de={X} />
              </button>
            </div>
          )
        })}
        <div className="actions-lignes">
          <button className="discret" onClick={() => setSaisies((t) => [...t, vierge()])}>
            <Icone de={Plus} /> Ajouter un rôle
          </button>
          {p.besoins.length > 0 && (
            <button className="discret" onClick={() => setSaisies(depuisBesoins(projet))}>
              <Icone de={ListRestart} /> Reprendre les besoins
            </button>
          )}
        </div>
      </div>

      <div className="resultat-remplir">
        <span>
          {resultat.places > 0 ? `${jours(resultat.places)} j placés en tout` : 'Rien à placer'}
          {resultat.manque > 0 && <span className="danger-texte">{` : il manque ${jours(resultat.manque)} j`}</span>}
        </span>
        {!a.scenario && <span className="discret">Sans colonne de scénario, les affectations seront créées dans le plan réel.</span>}
        <div className="boutons">
          <button onClick={p.fermer}>Annuler</button>
          <button className="principal" disabled={resultat.affectations.length === 0 || (scenario === NOUVEAU && !nouveau.trim())} onClick={() => void creer()}>
            {a.scenario && nomScenario ? `Créer dans ${nomScenario}` : 'Créer'}
          </button>
        </div>
      </div>
    </section>
  )
}
