import { Document } from 'yaml'
import { identifiant } from '../bi/sql'
import type { Source } from '../schema'
import { OPTIONS_SORTIE_CONFIG } from '../schema-ecriture'

// Dashboard « Burndown par version » d'une base Jira (spec §16 « Historique,
// résolution et temps ») : un fichier de dashboard ordinaire (§10, analyse
// SQL), écrit une fois, que l'on retouche ensuite comme les autres. Il lit les
// colonnes posées par l'historique (`cree`, `termine`) et, avec les temps,
// l'estimation initiale.

/**
 * Requêtes du burndown sur la table `base`. Un ticket est restant un jour donné
 * s'il est créé ce jour-là ou avant, et pas encore terminé à la fin de ce jour.
 * La ligne idéale va du périmètre de la version (tous ses tickets, toutes leurs
 * estimations) à zéro le dernier jour : des tickets arrivent en cours de route,
 * partir du premier jour l'écraserait.
 * Bornes : `debut` et `fin` si on les choisit, sinon du premier ticket créé à
 * aujourd'hui (ou au dernier ticket créé, s'il est plus tard).
 */
export function requetesBurndown(base: string, temps: boolean): Record<string, string> {
  const table = identifiant(base)
  const estimation = temps ? 'coalesce(estimation, 0)' : '0'
  return {
    versions: `select distinct unnest(versions) as version from ${table} order by version`,
    synthese: `select
  count(*) filter (where termine is null) as restants,
  count(*) filter (where termine is not null) as termines,
  coalesce(sum(${estimation}) filter (where termine is null), 0) as heures
from ${table} where list_contains(versions, {{version}})`,
    burndown: `with t as (
  select cree::date as cree, termine::date as termine, ${estimation} as heures
  from ${table} where list_contains(versions, {{version}}) and cree is not null
),
bornes as (
  select coalesce({{debut}}, min(cree)) as d, coalesce({{fin}}, greatest(max(cree), {{aujourdhui}})) as f from t
),
jours as (
  select unnest(generate_series(d::timestamp, f::timestamp, interval 1 day))::date as jour, d, f from bornes where d is not null
),
perimetre as (
  select count(*) as n, sum(heures) as h from t
),
courbe as (
  select jour, d, f,
    count(*) filter (where t.cree <= jour and (t.termine is null or t.termine > jour)) as restants,
    coalesce(sum(t.heures) filter (where t.cree <= jour and (t.termine is null or t.termine > jour)), 0) as heures
  from jours cross join t
  group by jour, d, f
)
select jour,
  case when jour <= {{aujourdhui}} then restants end as "Restants",
  round(n * (1 - date_diff('day', d, jour)::double / greatest(date_diff('day', d, f), 1)), 1) as "Idéal",
  case when jour <= {{aujourdhui}} then heures end as "Heures restantes",
  round(h * (1 - date_diff('day', d, jour)::double / greatest(date_diff('day', d, f), 1)), 1) as "Idéal (h)"
from courbe cross join perimetre
order by jour`,
    restants: `select cle, resume, statut, assigne${temps ? ', estimation' : ''}
from ${table} where list_contains(versions, {{version}}) and termine is null
order by statut, cle`,
  }
}

/** Le dashboard est-il le burndown de `base` ? (sa requête `burndown` lit la table de la base) */
export function estBurndownDe(requetes: Readonly<Record<string, string>>, base: string): boolean {
  return requetes.burndown?.includes(`from ${identifiant(base)}`) === true
}

/** Texte du fichier `_dashboards/<id>.yaml` du burndown d'une base Jira. */
export function dashboardBurndown(id: string, nom: string, base: string, source: Pick<Source, 'temps'>): string {
  const temps = source.temps === true
  const rangees = [
    {
      hauteur: 160,
      blocs: [
        { type: 'valeur', titre: 'Tickets restants', donnees: 'synthese', valeur: 'restants', format: 'entier' },
        { type: 'valeur', titre: 'Tickets terminés', donnees: 'synthese', valeur: 'termines', format: 'entier' },
        ...(temps ? [{ type: 'valeur', titre: 'Heures estimées restantes', donnees: 'synthese', valeur: 'heures', format: 'decimal' }] : []),
      ],
    },
    { hauteur: 320, blocs: [{ type: 'courbe', titre: 'Tickets restants et ligne idéale', donnees: 'burndown', x: 'jour', y: ['Restants', 'Idéal'] }] },
    ...(temps
      ? [{ hauteur: 320, blocs: [{ type: 'courbe', titre: 'Heures restantes (estimations initiales)', donnees: 'burndown', x: 'jour', y: ['Heures restantes', 'Idéal (h)'] }] }]
      : []),
    { blocs: [{ type: 'tableau', titre: 'Tickets restants', donnees: 'restants' }] },
  ]
  return new Document({
    id,
    nom,
    parametres: [
      { nom: 'version', libelle: 'Version', type: 'choix', options: 'versions' },
      { nom: 'debut', libelle: 'Début', type: 'date' },
      { nom: 'fin', libelle: 'Fin', type: 'date' },
    ],
    requetes: requetesBurndown(base, temps),
    rangees,
  }).toString(OPTIONS_SORTIE_CONFIG)
}
