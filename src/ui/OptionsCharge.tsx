import { nomNiveau, PERIODES_PAR_DEFAUT, type Maille } from '../core/charge'
import type { Colonne, Schema } from '../core/schema'
import type { ModificationVue, Vue } from '../core/vue'
import { Choix, type EntreeChoix } from './Choix'
import { useEspace } from './contexte-espace'
import { entreesColonnes } from './EditeurFiltres'
import { Reglage, Section } from './reglages'

// Options du plan de charge (spec §21) : colonnes des ressources, puis base et
// colonnes des affectations, des absences et des besoins. Un lien ne s'écrit
// que complet ; changer de base reprend ses premières colonnes de chaque sorte.

type Champ = { cle: string; libelle: string; garde: (c: Colonne, ctx: { ressources: string; projets?: string; base?: string }) => boolean; facultatif?: string }
type Lien = 'affectations' | 'absences' | 'besoins' | 'phases' | 'moratoires'

const date = (c: Colonne) => c.type === 'date'
const MAILLES: Maille[] = ['jour', 'semaine', 'mois']
const NOMS_MAILLES: Record<Maille, string> = { jour: 'Jour', semaine: 'Semaine', mois: 'Mois' }
const UNITES: Record<Maille, string> = { jour: 'jours ouvrés', semaine: 'semaines', mois: 'mois' }
const CHOIX_PERIODES: Record<Maille, number[]> = { jour: [10, 20, 40], semaine: [8, 12, 16, 26], mois: [3, 6, 12] }
const relationVers = (cible: string | undefined) => (c: Colonne) => c.type === 'relation' && cible !== undefined && c.cible === cible

const CHAMPS: Record<Lien, Champ[]> = {
  affectations: [
    { cle: 'ressource', libelle: 'Ressource', garde: (c, x) => relationVers(x.ressources)(c) },
    { cle: 'projet', libelle: 'Projet (ou programme…)', garde: (c, x) => c.type === 'relation' && c.cible !== x.ressources && c.cible !== x.base },
    { cle: 'debut', libelle: 'Début', garde: date },
    { cle: 'fin', libelle: 'Fin', garde: date },
    { cle: 'jours', libelle: 'Jours par semaine', garde: (c) => c.type === 'number' },
    { cle: 'total', libelle: 'Jours au total', garde: (c) => c.type === 'number', facultatif: 'aucune (par semaine seulement)' },
    { cle: 'version', libelle: 'Version (ou étape…)', garde: (c, x) => c.type === 'relation' && c.cible !== x.ressources && c.cible !== x.projets && c.cible !== x.base, facultatif: 'aucune' },
    { cle: 'detail', libelle: 'Détail jour par jour', garde: (c) => c.type === 'text', facultatif: 'aucun (une case modifiée coupe l’affectation)' },
    { cle: 'scenario', libelle: 'Scénario', garde: (c) => c.type === 'select', facultatif: 'aucun (pas d’essais)' },
    { cle: 'remplace', libelle: 'Remplace (dans un scénario)', garde: (c, x) => c.type === 'relation' && c.cible === x.base, facultatif: 'aucune (un essai ne modifie pas le réel)' },
  ],
  absences: [
    { cle: 'ressource', libelle: 'Ressource', garde: (c, x) => relationVers(x.ressources)(c) },
    { cle: 'debut', libelle: 'Début', garde: date },
    { cle: 'fin', libelle: 'Fin', garde: date },
  ],
  besoins: [
    { cle: 'projet', libelle: 'Projet', garde: (c, x) => relationVers(x.projets)(c) },
    { cle: 'role', libelle: 'Rôle', garde: (c) => c.type === 'select' },
    { cle: 'jours', libelle: 'Jours', garde: (c) => c.type === 'number' },
    { cle: 'avant', libelle: 'À faire avant', garde: date },
    { cle: 'apres', libelle: 'À partir de', garde: date, facultatif: 'aucune (dès aujourd’hui)' },
    { cle: 'phase', libelle: 'Phase', garde: (c, x) => c.type === 'relation' && c.cible !== x.projets && c.cible !== x.ressources, facultatif: 'aucune' },
  ],
  phases: [
    { cle: 'debut', libelle: 'Début', garde: date },
    { cle: 'fin', libelle: 'Fin', garde: date },
    { cle: 'role', libelle: 'Rôle', garde: (c) => c.type === 'select', facultatif: 'aucun' },
  ],
  moratoires: [
    { cle: 'debut', libelle: 'Début', garde: date },
    { cle: 'fin', libelle: 'Fin', garde: date },
    { cle: 'ferme', libelle: 'Fermé (personne ne travaille)', garde: (c) => c.type === 'checkbox', facultatif: 'aucune (gels des livraisons seulement)' },
  ],
}

const TITRES: Record<Lien, { titre: string; aide: string; vide?: string }> = {
  affectations: { titre: 'Affectations', aide: 'Qui travaille sur quel projet, de quand à quand, combien de jours par semaine.' },
  absences: { titre: 'Absences', aide: 'Elles réduisent la capacité de la ressource.', vide: 'aucune' },
  besoins: { titre: 'Besoins', aide: 'Pour chaque projet, combien de jours de quel rôle, dans quelle fenêtre (à partir de, avant, ou une phase) : le mode « Besoins » et « Remplir ».', vide: 'aucun' },
  phases: { titre: 'Phases', aide: 'Leurs dates donnent la fenêtre des besoins qui s’y relient (le développement avant la recette).', vide: 'aucune' },
  moratoires: {
    titre: 'Moratoires',
    aide: 'Fermé : personne ne travaille, comme un jour férié. Sinon, un gel des livraisons : on travaille, mais rien ne doit finir dedans.',
    vide: 'aucun',
  },
}

export function OptionsCharge({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const { etat } = useEspace()
  const nombres = schema.colonnes.filter((c) => c.type === 'number')
  const choix = schema.colonnes.filter((c) => c.type === 'select')
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot && b.id !== schema.id ? [b.depot.schema] : []))
  const projets = (() => {
    const a = vue.affectations
    if (!a) return undefined
    const c = etat.bases.get(a.base)?.depot?.schema.colonnes.find((x) => x.cle === a.projet)
    return c?.type === 'relation' ? c.cible : undefined
  })()
  const ctx = { ressources: schema.id, ...(projets && { projets }) }
  const versions = (() => {
    const a = vue.affectations
    const c = a?.version ? etat.bases.get(a.base)?.depot?.schema.colonnes.find((x) => x.cle === a.version) : undefined
    return c?.type === 'relation' ? c.cible : undefined
  })()
  const maille: Maille = vue.maille ?? 'semaine'
  const choixProjets = projets ? (etat.bases.get(projets)?.depot?.schema.colonnes.filter((c) => c.type === 'select') ?? []) : []

  const reglerLien = (lien: Lien, base: string | null, valeurs?: Record<string, string>) => {
    if (!base) return modifier({ [lien]: undefined })
    const s = bases.find((b) => b.id === base)
    if (!s) return
    const pris = new Set<string>()
    const objet: Record<string, string> = { base }
    for (const ch of CHAMPS[lien]) {
      const voulue = valeurs?.[ch.cle]
      const candidates = s.colonnes.filter((c) => ch.garde(c, { ...ctx, base: s.id }) && !pris.has(c.cle))
      if (ch.facultatif) {
        // Une colonne facultative ne se choisit jamais seule : seulement celle demandée.
        if (voulue && candidates.some((c) => c.cle === voulue)) {
          pris.add(voulue)
          objet[ch.cle] = voulue
        }
        continue
      }
      const c = candidates.find((x) => x.cle === voulue) ?? candidates[0]
      if (!c) return modifier({ [lien]: undefined })
      pris.add(c.cle)
      objet[ch.cle] = c.cle
    }
    modifier({ [lien]: objet })
  }

  return (
    <div className="reglages">
      <Section titre="Ressources">
        <Reglage libelle="Capacité">
          <Choix
            valeur={vue.capacite ?? ''}
            entrees={[{ valeur: '', libelle: '5 jours par semaine' }, ...entreesColonnes(nombres)]}
            libelle="Capacité"
            inconnue={`${vue.capacite} (disparue)`}
            changer={(v) => modifier({ capacite: v || undefined })}
          />
        </Reglage>
        <Reglage libelle="Rôle">
          <Choix
            valeur={vue.groupe ?? ''}
            entrees={[{ valeur: '', libelle: 'aucun' }, ...entreesColonnes(choix)]}
            libelle="Rôle"
            inconnue={`${vue.groupe} (disparue)`}
            changer={(v) => modifier({ groupe: v || undefined })}
          />
        </Reglage>
        <Reglage libelle="Grouper les lignes par">
          <Choix
            valeur={vue.regrouper ?? ''}
            entrees={[
              { valeur: '', libelle: 'rôle' },
              { valeur: 'projet', libelle: nomNiveau(projets && etat.bases.get(projets)?.depot?.schema.nom, 'projet') },
              ...(vue.affectations?.version ? [{ valeur: 'version', libelle: nomNiveau(versions && etat.bases.get(versions)?.depot?.schema.nom, 'version') }] : []),
            ]}
            libelle="Grouper les lignes par"
            changer={(v) => modifier({ regrouper: v === 'projet' || v === 'version' ? v : undefined })}
          />
        </Reglage>
        <Reglage libelle="Maille">
          <Choix
            valeur={maille}
            entrees={MAILLES.map((m) => ({ valeur: m, libelle: NOMS_MAILLES[m] }))}
            libelle="Maille"
            changer={(v) => modifier({ maille: v === 'semaine' ? undefined : (v as Maille), periodes: undefined })}
          />
        </Reglage>
        <Reglage libelle="Période affichée">
          <Choix
            valeur={String(vue.periodes ?? PERIODES_PAR_DEFAUT[maille])}
            entrees={CHOIX_PERIODES[maille].map((n) => ({ valeur: String(n), libelle: `${n} ${UNITES[maille]}` }))}
            libelle="Période affichée"
            changer={(v) => modifier({ periodes: Number(v) === PERIODES_PAR_DEFAUT[maille] ? undefined : Number(v) })}
          />
        </Reglage>
        <Reglage libelle="Jours fériés">
          <Choix
            valeur={vue.feries ?? 'france'}
            entrees={[
              { valeur: 'france', libelle: 'France' },
              { valeur: 'aucun', libelle: 'aucun' },
            ]}
            libelle="Jours fériés"
            changer={(v) => modifier({ feries: v === 'aucun' ? 'aucun' : undefined })}
          />
        </Reglage>
      </Section>
      {(['affectations', 'absences', 'besoins', 'phases', 'moratoires'] as const).map((lien) => {
        const actuel = vue[lien] as Record<string, string> | undefined
        const s = actuel && bases.find((b) => b.id === actuel.base)
        const entreesBases: EntreeChoix[] = [...(TITRES[lien].vide ? [{ valeur: '', libelle: TITRES[lien].vide }] : []), ...bases.map((b) => ({ valeur: b.id, libelle: b.nom }))]
        return (
          <Section key={lien} titre={TITRES[lien].titre} aide={TITRES[lien].aide}>
            <Reglage libelle="Base">
              <Choix
                valeur={actuel?.base ?? ''}
                entrees={entreesBases}
                vide="choisir une base"
                libelle={`Base des ${TITRES[lien].titre.toLowerCase()}`}
                inconnue={`${actuel?.base} (disparue)`}
                changer={(v) => reglerLien(lien, v || null)}
              />
            </Reglage>
            {s &&
              CHAMPS[lien].map((ch) => (
                <Reglage key={ch.cle} libelle={ch.libelle}>
                  <Choix
                    valeur={actuel[ch.cle] ?? ''}
                    entrees={[...(ch.facultatif ? [{ valeur: '', libelle: ch.facultatif }] : []), ...entreesColonnes(s.colonnes.filter((c) => ch.garde(c, { ...ctx, base: s.id })))]}
                    libelle={`${TITRES[lien].titre} : ${ch.libelle}`}
                    inconnue={`${actuel[ch.cle]} (disparue)`}
                    changer={(v) => reglerLien(lien, s.id, { ...actuel, [ch.cle]: v })}
                  />
                </Reglage>
              ))}
          </Section>
        )
      })}
      {projets && (
        <Section titre="Graphique" aide="Couleur de chaque projet dans le graphique : celle d’une option des projets, ou une couleur par projet.">
          <Reglage libelle="Couleur des projets">
            <Choix
              valeur={vue.couleurPar ?? ''}
              entrees={[{ valeur: '', libelle: 'une couleur par projet' }, ...entreesColonnes(choixProjets)]}
              libelle="Couleur des projets"
              inconnue={`${vue.couleurPar} (disparue)`}
              changer={(v) => modifier({ couleurPar: v || undefined })}
            />
          </Reglage>
        </Section>
      )}
    </div>
  )
}
