import type { Colonne, Schema } from '../core/schema'
import type { ModificationVue, Vue } from '../core/vue'
import { Choix, type EntreeChoix } from './Choix'
import { useEspace } from './contexte-espace'
import { entreesColonnes } from './EditeurFiltres'
import { Reglage, Section } from './reglages'

// Options du plan de charge (spec §21) : colonnes des ressources, puis base et
// colonnes des affectations, des absences et des besoins. Un lien ne s'écrit
// que complet ; changer de base reprend ses premières colonnes de chaque sorte.

type Champ = { cle: string; libelle: string; garde: (c: Colonne, ctx: { ressources: string; projets?: string }) => boolean }
type Lien = 'affectations' | 'absences' | 'besoins'

const date = (c: Colonne) => c.type === 'date'
const relationVers = (cible: string | undefined) => (c: Colonne) => c.type === 'relation' && cible !== undefined && c.cible === cible

const CHAMPS: Record<Lien, Champ[]> = {
  affectations: [
    { cle: 'ressource', libelle: 'Ressource', garde: (c, x) => relationVers(x.ressources)(c) },
    { cle: 'projet', libelle: 'Projet', garde: (c, x) => c.type === 'relation' && c.cible !== x.ressources },
    { cle: 'debut', libelle: 'Début', garde: date },
    { cle: 'fin', libelle: 'Fin', garde: date },
    { cle: 'jours', libelle: 'Jours par semaine', garde: (c) => c.type === 'number' },
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
  ],
}

const TITRES: Record<Lien, { titre: string; aide: string; vide?: string }> = {
  affectations: { titre: 'Affectations', aide: 'Qui travaille sur quel projet, de quand à quand, combien de jours par semaine.' },
  absences: { titre: 'Absences', aide: 'Elles réduisent la capacité de la ressource.', vide: 'aucune' },
  besoins: { titre: 'Besoins', aide: 'Pour chaque projet, combien de jours de quel rôle, et avant quand : le mode « Par projet ».', vide: 'aucun' },
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

  const reglerLien = (lien: Lien, base: string | null, valeurs?: Record<string, string>) => {
    if (!base) return modifier({ [lien]: undefined })
    const s = bases.find((b) => b.id === base)
    if (!s) return
    const pris = new Set<string>()
    const objet: Record<string, string> = { base }
    for (const ch of CHAMPS[lien]) {
      const voulue = valeurs?.[ch.cle]
      const candidates = s.colonnes.filter((c) => ch.garde(c, ctx))
      const c = candidates.find((x) => x.cle === voulue) ?? candidates.find((x) => !pris.has(x.cle)) ?? candidates[0]
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
        <Reglage libelle="Grouper par (rôle)">
          <Choix
            valeur={vue.groupe ?? ''}
            entrees={[{ valeur: '', libelle: 'aucun groupement' }, ...entreesColonnes(choix)]}
            libelle="Grouper par"
            inconnue={`${vue.groupe} (disparue)`}
            changer={(v) => modifier({ groupe: v || undefined })}
          />
        </Reglage>
        <Reglage libelle="Semaines affichées">
          <Choix
            valeur={String(vue.semaines ?? 12)}
            entrees={[8, 12, 16, 26].map((n) => ({ valeur: String(n), libelle: `${n} semaines` }))}
            libelle="Semaines affichées"
            changer={(v) => modifier({ semaines: Number(v) === 12 ? undefined : Number(v) })}
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
      {(['affectations', 'absences', 'besoins'] as const).map((lien) => {
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
                    entrees={entreesColonnes(s.colonnes.filter((c) => ch.garde(c, ctx)))}
                    libelle={`${TITRES[lien].titre} : ${ch.libelle}`}
                    inconnue={`${actuel[ch.cle]} (disparue)`}
                    changer={(v) => reglerLien(lien, s.id, { ...actuel, [ch.cle]: v })}
                  />
                </Reglage>
              ))}
          </Section>
        )
      })}
    </div>
  )
}
