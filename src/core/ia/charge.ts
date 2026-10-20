import { arrondiJours, besoinsAPlacer, calculerCharge, couvrirBesoins, etatCase, lireMoratoires, periodes, remplir, roleDe, type LigneRemplissage, type Maille, type OptionsCalcul, type ReglagesCharge } from '../charge'
import type { EtatEspace } from '../depot-espace'
import type { Vue } from '../vue'
import { decaler } from '../temps'
import { erreur, trouverBase, trouverLigne } from './references'

// `calculer_charge` (spec §21) : la charge, la capacité et la couverture des
// besoins d'une vue Plan de charge, en texte, pour l'assistant comme pour le MCP ;
// `proposer_remplissage` : ce que « Remplir » placerait, avec les valeurs à créer.

const PERIODES_MAX = 31
const UNITES: Record<Maille, [string, string]> = { jour: ['jour ouvré', 'jours ouvrés'], semaine: ['semaine', 'semaines'], mois: ['mois', 'mois'] }
const nombre = (n: number) => String(arrondiJours(n)).replace('.', ',')
const jour = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const libelle = (maille: Maille, iso: string) => (maille === 'mois' ? iso.slice(0, 7) : jour(iso))

const jourValide = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** La vue Plan de charge visée par `base` et `vue` (la première de l'espace par défaut). */
function vueCharge(etat: EtatEspace, args: Record<string, unknown>): { base: string; vue: Vue } {
  const vues = [...etat.bases.values()].flatMap((b) => b.vues.filter((v) => v.type === 'charge').map((v) => ({ base: b.id, vue: v })))
  const voulue = args.base === undefined ? undefined : trouverBase(etat, args.base).id
  const choisie: { base: string; vue: Vue } =
    (voulue === undefined ? vues[0] : vues.find((v) => v.base === voulue && (args.vue === undefined || v.vue.id === args.vue || v.vue.nom === args.vue))) ??
    erreur(voulue === undefined ? 'aucune vue Plan de charge dans l’espace : crée-en une sur la base des ressources' : `aucune vue Plan de charge dans ${voulue}`)
  return choisie
}

/** Les lignes des moratoires et des phases de la vue, pour le calcul. */
const contexte = (etat: EtatEspace, vue: ReglagesCharge, scenario: string | null): OptionsCalcul => {
  const lignes = (id: string | undefined) => (id ? (etat.bases.get(id)?.depot?.lignes() ?? []) : [])
  return { scenario, moratoires: lignes(vue.moratoires?.base), phases: lignes(vue.phases?.base) }
}

const scenarioDe = (args: Record<string, unknown>) => (typeof args.scenario === 'string' && args.scenario.trim() !== '' ? args.scenario.trim() : null)

export function calculerChargeOutil(etat: EtatEspace, args: Record<string, unknown>, aujourdhui: string): string {
  const { base, vue } = vueCharge(etat, args)
  const aff = vue.affectations ?? erreur(`la vue ${vue.nom} n'a pas de base d'affectations réglée`)
  const debut = jourValide(args.debut) ? args.debut : aujourdhui
  const maille: Maille = args.maille === 'jour' || args.maille === 'mois' ? args.maille : 'semaine'
  const voulu = typeof args.periodes === 'number' ? args.periodes : typeof args.semaines === 'number' ? args.semaines : undefined
  const n = Math.min(PERIODES_MAX, Math.max(1, voulu !== undefined ? Math.round(voulu) : maille === 'jour' ? 10 : maille === 'mois' ? 6 : 8))
  const lignes = (id: string | undefined) => (id ? (etat.bases.get(id)?.depot?.lignes() ?? []) : [])
  const ressources = lignes(base)
  const affectations = lignes(aff.base)
  const colonnes = periodes(maille, debut, n)
  const scenario = scenarioDe(args)
  const options = contexte(etat, vue, scenario)
  const charge = calculerCharge(vue, ressources, affectations, lignes(vue.absences?.base), colonnes, options)
  const titre = (b: string | undefined, id: string) => (b && etat.titres.get(b)?.get(id)) || id
  const projets = etat.bases.get(aff.base)?.depot?.schema.colonnes.find((c) => c.cle === aff.projet)
  const baseProjets = projets?.type === 'relation' ? projets.cible : undefined

  const lignesRessources = ressources.map((r) => {
    const role = roleDe(vue, r)
    const cases = charge.get(r.id)!.map((c) => {
      const e = etatCase(c)
      const marque = e === 'surchargee' ? ' SURCHARGE' : e === 'absente' ? ' absente' : e === 'fermee' ? ' férié' : ''
      return `${libelle(maille, c.debut)} ${nombre(c.charge)}/${nombre(c.capacite)}${marque}`
    })
    return `${r.id} | ${titre(base, r.id)}${role ? ` (${role})` : ''} | ${cases.join(' ; ')}`
  })
  const sortie = [
    `Plan de charge « ${vue.nom} » (base ${base}), ${n} ${UNITES[maille][n > 1 ? 1 : 0]} à partir du ${colonnes[0]!.debut}${scenario ? `, plan réel + scénario « ${scenario} »` : ', plan réel'} ; chaque période : charge/capacité nette en jours (absences et fériés retirés de la capacité).`,
    ...lireMoratoires(vue, options.moratoires).map((m) => `Moratoire ${titre(vue.moratoires?.base, m.id)} du ${m.debut} au ${m.fin} : ${m.ferme ? 'fermé, personne ne travaille' : 'gel des livraisons (on travaille, rien ne se livre)'}`),
    ...lignesRessources,
  ]
  if (vue.besoins) {
    const couvertures = couvrirBesoins(vue, ressources, affectations, lignes(vue.besoins.base), options)
    if (couvertures.length > 0) {
      sortie.push('Besoins (jours affectés au projet par le rôle avant la date / jours demandés) :')
      for (const c of couvertures) {
        const manque = c.demandes - c.affectes
        sortie.push(
          `${c.besoin} | ${c.projet ? titre(baseProjets, c.projet) : 'sans projet'} | ${c.role ?? 'tout rôle'}${c.apres ? ` à partir du ${c.apres}` : ''}${c.avant ? ` avant ${c.avant}` : ''} | ${nombre(c.affectes)}/${nombre(c.demandes)}${manque > 0.25 ? ` : il manque ${nombre(manque)} j` : ' : couvert'}`,
        )
      }
    }
  }
  return sortie.join('\n')
}

export function proposerRemplissageOutil(etat: EtatEspace, args: Record<string, unknown>, aujourdhui: string): string {
  const { base, vue } = vueCharge(etat, args)
  const aff = vue.affectations ?? erreur(`la vue ${vue.nom} n'a pas de base d'affectations réglée`)
  const schemaAff = etat.bases.get(aff.base)?.depot?.schema ?? erreur(`base ${aff.base} introuvable`)
  const cible = (cle: string | undefined) => {
    const c = cle ? schemaAff.colonnes.find((x) => x.cle === cle) : undefined
    return c?.type === 'relation' ? c.cible : undefined
  }
  const baseProjets = cible(aff.projet) ?? erreur('la colonne projet des affectations n’est pas une relation')
  const projet = trouverLigne(etat, baseProjets, args.projet)
  const baseVersions = cible(aff.version)
  const version = args.version === undefined || args.version === null || args.version === '' ? null : baseVersions ? trouverLigne(etat, baseVersions, args.version) : erreur('pas de colonne de version réglée')
  const mode = args.mode === 'lisse' ? 'lisse' : 'tot'
  const scenario = scenarioDe(args)
  const options = contexte(etat, vue, scenario)
  const lignes = (id: string | undefined) => (id ? (etat.bases.get(id)?.depot?.lignes() ?? []) : [])
  const finParDefaut = jourValide(args.fin) ? args.fin : null
  // Les lignes : données une à une, d'après les besoins du projet, ou une seule (rôle, jours, début, fin).
  const aPlacer: LigneRemplissage[] = Array.isArray(args.lignes)
    ? args.lignes.map((l: unknown, i) => {
        const x = (typeof l === 'object' && l !== null ? l : {}) as Record<string, unknown>
        const jours = typeof x.jours === 'number' && x.jours > 0 ? x.jours : erreur(`lignes[${i}].jours : nombre positif attendu`)
        const fin = jourValide(x.fin) ? x.fin : (finParDefaut ?? erreur(`lignes[${i}].fin : AAAA-MM-JJ attendu`))
        return { role: typeof x.role === 'string' && x.role !== '' ? x.role : null, jours, debut: jourValide(x.debut) ? x.debut : aujourdhui, fin }
      })
    : args.depuis_besoins === true
      ? besoinsAPlacer(vue, lignes(base), lignes(aff.base), lignes(vue.besoins?.base), projet, aujourdhui, finParDefaut ?? decaler(aujourdhui, 27), options)
      : [
          {
            role: typeof args.role === 'string' && args.role !== '' ? args.role : null,
            jours: typeof args.jours === 'number' && args.jours > 0 ? args.jours : erreur('jours : nombre positif attendu (ou lignes, ou depuis_besoins)'),
            debut: jourValide(args.debut) ? args.debut : aujourdhui,
            fin: finParDefaut ?? erreur('fin : AAAA-MM-JJ attendu'),
          },
        ]
  if (aPlacer.length === 0) return `Rien à placer pour « ${projet} » : ses besoins sont couverts (ou il n'en a pas).`
  const res = remplir(vue, lignes(base), lignes(aff.base), lignes(vue.absences?.base), { projet, version, mode, scenario, lignes: aPlacer }, options)
  const titre = (b: string | undefined, id: string) => (b && etat.titres.get(b)?.get(id)) || id
  const sortie = [
    `Remplissage de « ${titre(baseProjets, projet)} », ${mode === 'lisse' ? 'lissé' : 'au plus tôt'}, dans la capacité libre du plan réel${scenario ? ` + scénario « ${scenario} »` : ''} : ${nombre(res.places)} j placés${res.manque > 0 ? `, il manque ${nombre(res.manque)} j` : ''}.`,
    ...res.lignes.map(
      (l, i) =>
        `${i + 1}. ${l.role ?? 'tout rôle'}, ${nombre(l.jours)} j du ${aPlacer[i]!.debut} au ${l.fin}${l.gel ? ` (fin ramenée avant le gel ${titre(vue.moratoires?.base, l.gel)})` : ''} : ${nombre(l.places)} j placés${l.manque > 0 ? `, il manque ${nombre(l.manque)} j` : ''}${l.finTravail ? `, fini le ${l.finTravail}` : ''}`,
    ),
  ]
  if (res.affectations.length === 0) return [...sortie, 'Aucune affectation à créer.'].join('\n')
  sortie.push(`Affectations à créer avec creer_lignes dans la base ${aff.base} (rien n'est écrit pour l'instant) :`)
  for (const x of res.affectations) sortie.push(JSON.stringify({ [schemaAff.champTitre]: `${titre(base, x.ressource)} sur ${titre(baseProjets, projet)}`, ...x.valeurs }))
  const colScenario = aff.scenario ? schemaAff.colonnes.find((c) => c.cle === aff.scenario) : undefined
  if (scenario && aff.scenario && colScenario?.type === 'select' && !colScenario.options.some((o) => o.label === scenario))
    sortie.push(`Le scénario « ${scenario} » n'existe pas encore : ajoute d'abord l'option avec ajouter_options (colonne ${aff.scenario} de ${aff.base}).`)
  if (scenario && !aff.scenario) sortie.push('La vue n’a pas de colonne de scénario : ces affectations iraient dans le plan réel.')
  return sortie.join('\n')
}
