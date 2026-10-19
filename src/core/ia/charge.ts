import { arrondiJours, calculerCharge, couvrirBesoins, etatCase, roleDe, semaines } from '../charge'
import type { EtatEspace } from '../depot-espace'
import type { Vue } from '../vue'
import { erreur, trouverBase } from './references'

// `calculer_charge` (spec §21) : la charge, la capacité et la couverture des
// besoins d'une vue Plan de charge, en texte, pour l'assistant comme pour le MCP.

const SEMAINES_MAX = 26
const nombre = (n: number) => String(arrondiJours(n)).replace('.', ',')
const jour = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function calculerChargeOutil(etat: EtatEspace, args: Record<string, unknown>, aujourdhui: string): string {
  const vues = [...etat.bases.values()].flatMap((b) => b.vues.filter((v) => v.type === 'charge').map((v) => ({ base: b.id, vue: v })))
  const voulue = args.base === undefined ? undefined : trouverBase(etat, args.base).id
  const choisie: { base: string; vue: Vue } =
    (voulue === undefined ? vues[0] : vues.find((v) => v.base === voulue && (args.vue === undefined || v.vue.id === args.vue || v.vue.nom === args.vue))) ??
    erreur(voulue === undefined ? 'aucune vue Plan de charge dans l’espace : crée-en une sur la base des ressources' : `aucune vue Plan de charge dans ${voulue}`)
  const { base, vue } = choisie
  const aff = vue.affectations ?? erreur(`la vue ${vue.nom} n'a pas de base d'affectations réglée`)
  const debut = typeof args.debut === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.debut) ? args.debut : aujourdhui
  const n = Math.min(SEMAINES_MAX, Math.max(1, typeof args.semaines === 'number' ? Math.round(args.semaines) : 8))
  const lignes = (id: string | undefined) => (id ? (etat.bases.get(id)?.depot?.lignes() ?? []) : [])
  const ressources = lignes(base)
  const affectations = lignes(aff.base)
  const lundis = semaines(debut, n)
  const charge = calculerCharge(vue, ressources, affectations, lignes(vue.absences?.base), lundis)
  const titre = (b: string | undefined, id: string) => (b && etat.titres.get(b)?.get(id)) || id
  const projets = etat.bases.get(aff.base)?.depot?.schema.colonnes.find((c) => c.cle === aff.projet)
  const baseProjets = projets?.type === 'relation' ? projets.cible : undefined

  const lignesRessources = ressources.map((r) => {
    const role = roleDe(vue, r)
    const cases = charge.get(r.id)!.map((c) => {
      const e = etatCase(c)
      const marque = e === 'surchargee' ? ' SURCHARGE' : e === 'absente' ? ' absente' : ''
      return `${jour(c.lundi)} ${nombre(c.charge)}/${nombre(c.capacite)}${marque}`
    })
    return `${r.id} | ${titre(base, r.id)}${role ? ` (${role})` : ''} | ${cases.join(' ; ')}`
  })
  const sortie = [
    `Plan de charge « ${vue.nom} » (base ${base}), ${n} semaine${n > 1 ? 's' : ''} à partir du lundi ${lundis[0]} ; chaque semaine : charge/capacité nette en jours (absences et fériés retirés de la capacité).`,
    ...lignesRessources,
  ]
  if (vue.besoins) {
    const couvertures = couvrirBesoins(vue, ressources, affectations, lignes(vue.besoins.base))
    if (couvertures.length > 0) {
      sortie.push('Besoins (jours affectés au projet par le rôle avant la date / jours demandés) :')
      for (const c of couvertures) {
        const manque = c.demandes - c.affectes
        sortie.push(
          `${c.besoin} | ${c.projet ? titre(baseProjets, c.projet) : 'sans projet'} | ${c.role ?? 'tout rôle'}${c.avant ? ` avant ${c.avant}` : ''} | ${nombre(c.affectes)}/${nombre(c.demandes)}${manque > 0.25 ? ` : il manque ${nombre(manque)} j` : ' : couvert'}`,
        )
      }
    }
  }
  return sortie.join('\n')
}
