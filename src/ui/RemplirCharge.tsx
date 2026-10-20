import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { LigneChargee } from '../core/base'
import { ligneApercu, remplir, type ModeRemplissage, type OptionsCalcul, type ReglagesCharge, type Remplissage } from '../core/charge'
import type { DepotEspace } from '../core/depot-espace'
import { decaler } from '../core/temps'
import { useLancer } from './actions'
import { Choix } from './Choix'
import { Icone } from './icones'

// « Remplir » du plan de charge (spec §21) : placer N jours d'un projet sur une
// période dans la capacité libre de la situation affichée. L'aperçu se voit
// aussitôt dans la grille (lignes d'aperçu remontées par `apercu`) ; « Créer »
// écrit les affectations dans un scénario, en une étape d'annulation.

const NOUVEAU = '\u0000nouveau'
const TOUS = ''

type Props = {
  espace: DepotEspace
  r: ReglagesCharge
  ressources: readonly LigneChargee[]
  affectations: readonly LigneChargee[]
  absences: readonly LigneChargee[]
  options: OptionsCalcul
  projets: { id: string; titre: string }[]
  versionsDe: (projet: string) => { id: string; titre: string }[]
  roles: string[]
  scenarios: string[]
  nomProjet: string
  nomVersion: string
  titreRessource: (id: string) => string
  champTitre: string
  aujourdhui: string
  apercu: (lignes: LigneChargee[]) => void
  fermer: () => void
  /** Après création : le scénario où les affectations ont été écrites (null : plan réel). */
  cree: (scenario: string | null) => void
}

/** Premier nom libre de la forme « Option A », « Option B »… */
function nomLibre(pris: readonly string[]): string {
  for (let i = 0; i < 26; i++) {
    const nom = `Option ${String.fromCharCode(65 + i)}`
    if (!pris.includes(nom)) return nom
  }
  return `Option ${pris.length + 1}`
}

export function RemplirCharge(p: Props) {
  const lancer = useLancer()
  const a = p.r.affectations!
  const [projet, setProjet] = useState(p.projets[0]?.id ?? '')
  const [version, setVersion] = useState('')
  const [role, setRole] = useState(TOUS)
  const [jours, setJours] = useState('10')
  const [debut, setDebut] = useState(p.aujourdhui)
  const [fin, setFin] = useState(decaler(p.aujourdhui, 27))
  const [mode, setMode] = useState<ModeRemplissage>('tot')
  const [scenario, setScenario] = useState(a.scenario ? (p.scenarios[0] ?? NOUVEAU) : '')
  const [nouveau, setNouveau] = useState(() => nomLibre(p.scenarios))
  const versions = projet && a.version ? p.versionsDe(projet) : []
  const nomScenario = scenario === NOUVEAU ? nouveau.trim() : scenario

  const n = Number(jours.replace(',', '.'))
  const affiche = p.options.scenario ?? null
  const resultat: Remplissage = useMemo(
    () =>
      projet && Number.isFinite(n) && n > 0
        ? remplir(p.r, p.ressources, p.affectations, p.absences, { projet, version: version || null, role: role || null, jours: n, debut, fin, mode, scenario: nomScenario || null }, { scenario: affiche })
        : { affectations: [], places: 0, manque: 0 },
    [p.r, p.ressources, p.affectations, p.absences, affiche, projet, version, role, n, debut, fin, mode, nomScenario],
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

  const nbRessources = new Set(resultat.affectations.map((x) => x.ressource)).size
  return (
    <section className="remplir-charge" aria-label="Remplir">
      <div className="entete-remplir">
        <strong>Remplir</strong>
        <span className="discret">placer des jours dans la capacité libre</span>
        <button className="discret" aria-label="Fermer" onClick={p.fermer}>
          <Icone de={X} />
        </button>
      </div>
      <div className="champs-remplir">
        <label>
          <span>{p.nomProjet.charAt(0).toUpperCase() + p.nomProjet.slice(1)}</span>
          <Choix
            valeur={projet}
            entrees={p.projets.map((x) => ({ valeur: x.id, libelle: x.titre }))}
            vide="choisir"
            libelle={`Remplir : ${p.nomProjet}`}
            changer={(v) => {
              setProjet(v)
              setVersion('')
            }}
          />
        </label>
        {a.version && (
          <label>
            <span>{p.nomVersion.charAt(0).toUpperCase() + p.nomVersion.slice(1)}</span>
            <Choix valeur={version} entrees={[{ valeur: '', libelle: 'aucune' }, ...versions.map((x) => ({ valeur: x.id, libelle: x.titre }))]} libelle={`Remplir : ${p.nomVersion}`} changer={setVersion} />
          </label>
        )}
        {p.roles.length > 0 && (
          <label>
            <span>Rôle</span>
            <Choix valeur={role} entrees={[{ valeur: TOUS, libelle: 'tous' }, ...p.roles.map((x) => ({ valeur: x, libelle: x }))]} libelle="Remplir : rôle" changer={setRole} />
          </label>
        )}
        <label>
          <span>Jours</span>
          <input className="jours-remplir" type="number" min={0} step={0.5} value={jours} aria-label="Jours à placer" onChange={(e) => setJours(e.target.value)} />
        </label>
        <label>
          <span>Du</span>
          <input type="date" value={debut} aria-label="Du" onChange={(e) => e.target.value && setDebut(e.target.value)} />
        </label>
        <label>
          <span>Au</span>
          <input type="date" value={fin} aria-label="Au" onChange={(e) => e.target.value && setFin(e.target.value)} />
        </label>
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
            <Choix valeur={scenario} entrees={[...p.scenarios.map((x) => ({ valeur: x, libelle: x })), { valeur: NOUVEAU, libelle: 'Nouveau scénario' }]} libelle="Remplir : scénario" changer={setScenario} />
            {scenario === NOUVEAU && <input className="nom-scenario" value={nouveau} aria-label="Nom du scénario" onChange={(e) => setNouveau(e.target.value)} />}
          </label>
        )}
      </div>
      <div className="resultat-remplir">
        <span>
          {resultat.places > 0 ? `${String(resultat.places).replace('.', ',')} j placés sur ${nbRessources} ressource${nbRessources > 1 ? 's' : ''}` : 'Rien à placer'}
          {resultat.manque > 0 && <span className="danger-texte"> : il manque {String(resultat.manque).replace('.', ',')} j sur la période</span>}
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
