import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { FORMATS, NOM_VALIDE, TYPES_FICHE, TYPES_PARAMETRE, TYPES_VISUEL, nomAnalyse, type BlocAnalyse, type Format, type Parametre, type Regle, type TypeParametre, type TypeVisuel } from '../core/bi/analyse'
import type { ResultatsAnalyse } from '../core/bi/calcul'
import type { ResultatSql } from '../core/bi/sql'
import { COULEURS } from '../core/couleurs'
import type { Dashboard, ModificationAnalyse, OperationDashboard } from '../core/dashboard'
import { Choix } from './Choix'
import { Fenetre } from './fenetre'
import { Icone } from './icones'

// Réglages de l'analyse (spec §10 « Analyse ») : les requêtes et les
// paramètres du dashboard, et les réglages de chaque bloc.

const LIBELLES_TYPE: Record<TypeVisuel, string> = {
  valeur: 'Chiffre clé',
  barres: 'Barres',
  courbe: 'Courbe',
  aire: 'Aire',
  secteurs: 'Secteurs',
  nuage: 'Nuage de points',
  tableau: 'Tableau',
  texte: 'Texte',
  entete: 'En-tête de fiche',
  compte_a_rebours: 'Compte à rebours',
  etapes: 'Barres d’étapes',
  liste: 'Liste à pastilles',
  repartition: 'Répartition',
  frise: 'Frise',
}
const LIBELLES_FORMAT: Record<Format, string> = { nombre: 'Nombre', entier: 'Entier', decimal: 'Deux décimales', pourcent: 'Pourcentage', euros: 'Euros', date: 'Date' }
const LIBELLES_PARAMETRE: Record<TypeParametre, string> = { choix: 'Choix', texte: 'Texte', nombre: 'Nombre', date: 'Date', mois: 'Mois', periode: 'Période' }

/** Une liste de colonnes du résultat, ou un champ libre quand le résultat n'est pas encore là. */
function ChoixColonne({ libelle, valeur, colonnes, changer, vide = '(automatique)' }: { libelle: string; valeur: string | undefined; colonnes: string[]; changer: (v: string | null) => void; vide?: string }) {
  if (colonnes.length === 0) return <input aria-label={libelle} defaultValue={valeur ?? ''} onBlur={(e) => changer(e.target.value.trim() || null)} placeholder="colonne" />
  return <Choix libelle={libelle} valeur={valeur ?? ''} vide={vide} entrees={[{ valeur: '', libelle: vide }, ...colonnes.map((c) => ({ valeur: c, libelle: c }))]} changer={(v) => changer(v || null)} />
}

export function ReglagesBloc({ dashboard, bloc, resultat, modifier }: { dashboard: Dashboard; bloc: BlocAnalyse; resultat: ResultatSql | undefined; modifier: (m: ModificationAnalyse) => void }) {
  const colonnes = resultat?.colonnes.map((c) => c.nom) ?? []
  const requetes = Object.keys(dashboard.requetes)
  const source = bloc.sql !== undefined ? 'sql' : (bloc.donnees ?? '')
  const fiche = TYPES_FICHE.has(bloc.type)
  const graphique = !fiche && bloc.type !== 'valeur' && bloc.type !== 'tableau' && bloc.type !== 'texte'
  const formatUnique = typeof bloc.format === 'string' ? bloc.format : undefined

  return (
    <div className="reglages-analyse" aria-label={`Réglages de ${nomAnalyse(bloc)}`}>
      <label>
        Type
        <Choix libelle="Type" valeur={bloc.type} entrees={TYPES_VISUEL.map((t) => ({ valeur: t, libelle: LIBELLES_TYPE[t] }))} changer={(v) => modifier({ type: v as TypeVisuel })} />
      </label>
      {bloc.type === 'texte' ? (
        <label className="large">
          Texte (Markdown ; {'{{requete.colonne}}'} cite un résultat)
          <textarea aria-label="Texte" className="code" rows={6} defaultValue={bloc.texte ?? ''} onBlur={(e) => modifier({ texte: e.target.value || null })} />
        </label>
      ) : (
        <>
          <label>
            Données
            <Choix
              libelle="Données"
              valeur={source}
              vide="(aucune)"
              entrees={[{ valeur: '', libelle: '(aucune)' }, ...requetes.map((r) => ({ valeur: r, libelle: `Requête « ${r} »` })), { valeur: 'sql', libelle: 'Requête propre au bloc' }]}
              changer={(v) => {
                if (v === 'sql') modifier({ sql: bloc.sql ?? (bloc.donnees ? dashboard.requetes[bloc.donnees] : undefined) ?? 'select 1 as valeur', donnees: null })
                else modifier({ donnees: v || null, sql: null })
              }}
            />
          </label>
          {bloc.sql !== undefined && (
            <label className="large">
              SQL
              <textarea key={bloc.sql} aria-label="SQL du bloc" className="code" rows={6} spellCheck={false} defaultValue={bloc.sql} onBlur={(e) => e.target.value.trim() && e.target.value !== bloc.sql && modifier({ sql: e.target.value })} />
            </label>
          )}
        </>
      )}
      {bloc.type === 'valeur' && (
        <>
          <label>
            Valeur
            <ChoixColonne libelle="Valeur" valeur={bloc.valeur} colonnes={colonnes} changer={(valeur) => modifier({ valeur })} />
          </label>
          <label>
            Comparer à
            <ChoixColonne libelle="Comparer à" valeur={bloc.comparer} colonnes={colonnes} changer={(comparer) => modifier({ comparer })} vide="(rien)" />
          </label>
        </>
      )}
      {graphique && (
        <>
          <label>
            {bloc.type === 'secteurs' ? 'Libellé' : 'Axe X'}
            <ChoixColonne libelle={bloc.type === 'secteurs' ? 'Libellé' : 'Axe X'} valeur={bloc.x} colonnes={colonnes} changer={(x) => modifier({ x })} />
          </label>
          <fieldset>
            <legend>{bloc.type === 'secteurs' ? 'Valeur' : 'Mesures (Y)'}</legend>
            {colonnes.length === 0 ? (
              <input defaultValue={bloc.y?.join(', ') ?? ''} placeholder="colonne, colonne" onBlur={(e) => modifier({ y: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).length ? e.target.value.split(',').map((x) => x.trim()).filter(Boolean) : null })} />
            ) : (
              colonnes.map((c) => (
                <label key={c} className="case">
                  <input
                    type="checkbox"
                    checked={bloc.y?.includes(c) ?? false}
                    onChange={(e) => {
                      const y = e.target.checked ? [...(bloc.y ?? []), c] : (bloc.y ?? []).filter((x) => x !== c)
                      modifier({ y: y.length > 0 ? y : null })
                    }}
                  />
                  {c}
                </label>
              ))
            )}
          </fieldset>
          {bloc.type !== 'secteurs' && (
            <label>
              Séries par
              <ChoixColonne libelle="Séries par" valeur={bloc.serie} colonnes={colonnes} changer={(serie) => modifier({ serie })} vide="(aucune)" />
            </label>
          )}
          {bloc.type === 'nuage' && (
            <label>
              Taille des points
              <ChoixColonne libelle="Taille des points" valeur={bloc.taille} colonnes={colonnes} changer={(taille) => modifier({ taille })} vide="(fixe)" />
            </label>
          )}
          {(bloc.type === 'barres' || bloc.type === 'aire' || bloc.type === 'courbe') && (
            <label className="case">
              <input type="checkbox" checked={!!bloc.empile} onChange={(e) => modifier({ empile: e.target.checked || null })} />
              Empilé
            </label>
          )}
          {bloc.type === 'barres' && (
            <label className="case">
              <input type="checkbox" checked={!!bloc.horizontal} onChange={(e) => modifier({ horizontal: e.target.checked || null })} />
              Horizontal
            </label>
          )}
        </>
      )}
      {bloc.type === 'tableau' && colonnes.length > 0 && (
        <fieldset>
          <legend>Colonnes montrées</legend>
          {colonnes.map((c) => (
            <label key={c} className="case">
              <input
                type="checkbox"
                checked={bloc.colonnes ? bloc.colonnes.includes(c) : true}
                onChange={(e) => {
                  const actuelles = bloc.colonnes ?? colonnes
                  const suivantes = e.target.checked ? colonnes.filter((x) => actuelles.includes(x) || x === c) : actuelles.filter((x) => x !== c)
                  modifier({ colonnes: suivantes.length === colonnes.length ? null : suivantes })
                }}
              />
              {c}
            </label>
          ))}
        </fieldset>
      )}
      {bloc.type !== 'texte' && bloc.type !== 'tableau' && !fiche && (
        <label>
          Format
          <Choix
            libelle="Format"
            valeur={formatUnique ?? ''}
            entrees={[{ valeur: '', libelle: 'Nombre' }, ...FORMATS.filter((f) => f !== 'nombre').map((f) => ({ valeur: f, libelle: LIBELLES_FORMAT[f] }))]}
            changer={(v) => modifier({ format: (v as Format) || null })}
          />
        </label>
      )}
      {bloc.type === 'tableau' && colonnes.length > 0 && (
        <fieldset>
          <legend>Formats</legend>
          {colonnes.map((c) => {
            const parColonne = typeof bloc.format === 'object' ? bloc.format : {}
            return (
              <label key={c}>
                {c}
                <Choix
                  libelle={`Format de ${c}`}
                  valeur={parColonne[c] ?? ''}
                  entrees={[{ valeur: '', libelle: 'Automatique' }, ...FORMATS.map((f) => ({ valeur: f, libelle: LIBELLES_FORMAT[f] }))]}
                  changer={(v) => {
                    const { [c]: _ancien, ...reste } = parColonne
                    const suivant = v ? { ...reste, [c]: v as Format } : reste
                    modifier({ format: Object.keys(suivant).length > 0 ? suivant : null })
                  }}
                />
              </label>
            )
          })}
        </fieldset>
      )}
      {fiche && <ReglagesFiche dashboard={dashboard} bloc={bloc} colonnes={colonnes} modifier={modifier} />}
      {bloc.type !== 'texte' && !fiche && <EditeurRegles regles={bloc.regles ?? []} colonnes={colonnes} tableau={bloc.type === 'tableau'} changer={(regles) => modifier({ regles: regles.length > 0 ? regles : null })} />}
    </div>
  )
}

const liste = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

/** Champ texte libre, enregistré en quittant le champ ; vide le retire. */
function ChampTexte({ libelle, valeur, changer, indice, code }: { libelle: string; valeur: string | undefined; changer: (v: string | null) => void; indice?: string; code?: boolean }) {
  return (
    <label className={code ? 'large' : undefined}>
      {libelle}
      <input key={valeur} aria-label={libelle} className={code ? 'code' : undefined} spellCheck={!code} defaultValue={valeur ?? ''} placeholder={indice} onBlur={(e) => e.target.value.trim() !== (valeur ?? '') && changer(e.target.value.trim() || null)} />
    </label>
  )
}

/**
 * Réglages des blocs de fiche (spec §10 « Fiches ») : colonnes du résultat,
 * état et table de couleurs choisis parmi ceux du dashboard. Les états, les
 * tables, les jalons et les périodes d'une frise se déclarent dans le fichier
 * ou par l'assistant.
 */
function ReglagesFiche({ dashboard, bloc, colonnes, modifier }: { dashboard: Dashboard; bloc: BlocAnalyse; colonnes: string[]; modifier: (m: ModificationAnalyse) => void }) {
  const etats = Object.keys(dashboard.etats)
  const colonne = (libelle: string, cle: 'sous_titre' | 'date' | 'libelle' | 'element' | 'etape' | 'statut' | 'groupe' | 'detail_groupe' | 'detail' | 'x' | 'ligne' | 'debut' | 'fin' | 'categorie' | 'previsionnel', vide = '(automatique)') => (
    <label key={cle}>
      {libelle}
      <ChoixColonne libelle={libelle} valeur={bloc[cle]} colonnes={colonnes} changer={(v) => modifier({ [cle]: v })} vide={vide} />
    </label>
  )
  const tables = Object.keys(dashboard.couleurs)
  const tablePropre = typeof bloc.couleurs === 'object'
  const nomTable = typeof bloc.couleurs === 'string' ? bloc.couleurs : ''
  const couleurs = (
    <label key="couleurs">
      Couleurs
      <Choix
        libelle="Couleurs"
        valeur={tablePropre ? '*' : nomTable}
        vide="(aucune)"
        entrees={[{ valeur: '', libelle: '(aucune)' }, ...(tablePropre ? [{ valeur: '*', libelle: 'Table propre au bloc' }] : []), ...tables.map((t) => ({ valeur: t, libelle: `Table « ${t} »` }))]}
        changer={(v) => v !== '*' && modifier({ couleurs: v || null })}
      />
    </label>
  )
  const vide = <ChampTexte key="vide" libelle="Message si vide" valeur={bloc.vide} changer={(v) => modifier({ vide: v })} />

  switch (bloc.type) {
    case 'entete':
      return (
        <>
          <ChampTexte libelle="Titre (colonne ou texte)" valeur={bloc.titre} changer={(titre) => modifier({ titre })} indice={colonnes[0] ?? 'titre'} />
          {colonne('Sous-titre', 'sous_titre', '(aucun)')}
          <label>
            État
            <Choix libelle="État" valeur={bloc.etat ?? ''} vide="(aucun)" entrees={[{ valeur: '', libelle: '(aucun)' }, ...etats.map((e) => ({ valeur: e, libelle: e }))]} changer={(v) => modifier({ etat: v || null })} />
          </label>
        </>
      )
    case 'compte_a_rebours':
      return (
        <>
          {colonne('Date', 'date')}
          {colonne('Libellé', 'libelle', '(aucun)')}
          <label>
            Rouge sous (jours)
            <input type="number" min={0} aria-label="Rouge sous" defaultValue={bloc.seuils?.[0] ?? 8} onBlur={(e) => modifier({ seuils: [Number(e.target.value), Math.max(Number(e.target.value), bloc.seuils?.[1] ?? 31)] })} />
          </label>
          <label>
            Orange sous (jours)
            <input type="number" min={0} aria-label="Orange sous" defaultValue={bloc.seuils?.[1] ?? 31} onBlur={(e) => modifier({ seuils: [Math.min(Number(e.target.value), bloc.seuils?.[0] ?? 8), Number(e.target.value)] })} />
          </label>
          {vide}
        </>
      )
    case 'etapes':
      return (
        <>
          {colonne('Élément', 'element')}
          {colonne('Étape', 'etape')}
          {colonne('Statut', 'statut')}
          {colonne('Date', 'date', '(aucune)')}
          {colonne('Groupe', 'groupe', '(aucun)')}
          {colonne('Détail du groupe', 'detail_groupe', '(aucun)')}
          {couleurs}
          <ChampTexte
            libelle="Étapes, dans l'ordre"
            valeur={bloc.etapes?.map((e) => e.nom).join(', ')}
            indice="ordre d'apparition"
            changer={(v) => modifier({ etapes: v ? liste(v).map((nom) => bloc.etapes?.find((e) => e.nom === nom) ?? { nom }) : null })}
          />
        </>
      )
    case 'liste':
      return (
        <>
          {colonne('Libellé', 'libelle')}
          {colonne('Détail', 'detail', '(aucun)')}
          <label>
            Pastille
            <Choix
              libelle="Pastille"
              valeur={bloc.pastille ?? ''}
              vide="(aucune)"
              entrees={[{ valeur: '', libelle: '(aucune)' }, ...etats.map((e) => ({ valeur: e, libelle: `État « ${e} »`, groupe: 'États' })), ...colonnes.map((c) => ({ valeur: c, libelle: c, groupe: 'Colonnes (par la table de couleurs)' }))]}
              changer={(v) => modifier({ pastille: v || null })}
            />
          </label>
          {couleurs}
          <ChampTexte libelle="Garder (SQL)" valeur={bloc.garder} changer={(garder) => modifier({ garder })} indice="statut <> 'Fait'" code />
          <ChampTexte libelle="Trier par (SQL)" valeur={bloc.tri} changer={(tri) => modifier({ tri })} indice="echeance" code />
          <label>
            Lignes au plus
            <input type="number" min={1} aria-label="Lignes au plus" defaultValue={bloc.max ?? ''} onBlur={(e) => modifier({ max: Number(e.target.value) >= 1 ? Math.floor(Number(e.target.value)) : null })} />
          </label>
          {vide}
        </>
      )
    case 'repartition':
      return (
        <>
          {colonne('Catégorie', 'x')}
          <label>
            Nombre
            <ChoixColonne libelle="Nombre" valeur={bloc.y?.[0]} colonnes={colonnes} changer={(y) => modifier({ y: y ? [y] : null })} />
          </label>
          {couleurs}
          <ChampTexte libelle="Ordre des catégories" valeur={bloc.ordre?.join(', ')} indice="A, B, C" changer={(v) => modifier({ ordre: v ? liste(v) : null })} />
        </>
      )
    case 'frise':
      return (
        <>
          {colonne('Ligne', 'ligne')}
          {colonne('Catégorie', 'categorie', '(aucune)')}
          {colonne('Début', 'debut')}
          {colonne('Fin', 'fin')}
          {colonne('Prévisionnel (vrai ou faux)', 'previsionnel', '(aucun)')}
          {couleurs}
          {vide}
        </>
      )
    default:
      return null
  }
}

function EditeurRegles({ regles, colonnes, tableau, changer }: { regles: Regle[]; colonnes: string[]; tableau: boolean; changer: (r: Regle[]) => void }) {
  const remplacer = (i: number, r: Regle) => changer(regles.map((x, k) => (k === i ? r : x)))
  return (
    <fieldset className="regles-analyse">
      <legend>Mise en forme conditionnelle</legend>
      {regles.map((r, i) => (
        <div key={i} className="regle-analyse">
          <ChoixColonne libelle="Colonne testée" valeur={r.colonne} colonnes={colonnes} changer={(c) => remplacer(i, { ...r, ...(c ? { colonne: c } : { colonne: undefined }) })} vide={tableau ? '(colonne ?)' : '(la mesure)'} />
          <input defaultValue={r.si} placeholder="> 50" aria-label="Condition" onBlur={(e) => e.target.value.trim() && remplacer(i, { ...r, si: e.target.value.trim() })} />
          <Choix libelle="Couleur" valeur={r.couleur} entrees={COULEURS.map((c) => ({ valeur: c, libelle: c, couleur: c }))} changer={(c) => remplacer(i, { ...r, couleur: c })} />
          {tableau && (
            <label className="case" title="Colorer toute la ligne">
              <input type="checkbox" checked={!!r.ligne} onChange={(e) => remplacer(i, { ...r, ligne: e.target.checked || undefined })} />
              ligne
            </label>
          )}
          <button className="discret" onClick={() => changer(regles.filter((_, k) => k !== i))} aria-label="Retirer la règle">
            <Icone de={Trash2} />
          </button>
        </div>
      ))}
      <button className="discret" onClick={() => changer([...regles, { si: '> 0', couleur: 'rouge', ...(tableau && colonnes[0] && { colonne: colonnes[0] }) }])}>
        <Icone de={Plus} /> Ajouter une règle
      </button>
    </fieldset>
  )
}

// ── Requêtes et paramètres du dashboard ──────────────────────────

export function FenetreAnalyse({ dashboard, resultats, modifier, fermer }: { dashboard: Dashboard; resultats: ResultatsAnalyse | null; modifier: (op: OperationDashboard) => void; fermer: () => void }) {
  const [nouveau, setNouveau] = useState('')
  const noms = Object.keys(dashboard.requetes)
  const nomRefuse = nouveau !== '' && (!NOM_VALIDE.test(nouveau) || noms.includes(nouveau))
  return (
    <Fenetre titre="Requêtes et paramètres" fermer={fermer}>
      <div className="fenetre-analyse">
        <p className="discret">
          Chaque base est une table du nom de son id, une colonne par clé (colonnes calculées comprises). Les filtres du dashboard s'appliquent. Un paramètre se cite par {'{{nom}}'}.
        </p>
        <h3>Requêtes</h3>
        {noms.length === 0 && <p className="discret">Aucune requête : un bloc peut aussi porter la sienne.</p>}
        {noms.map((nom) => {
          const r = resultats?.requetes.get(nom)
          return (
            <div key={nom} className="requete-analyse">
              <div className="entete-requete">
                <code>{nom}</code>
                <span className="discret">{!r ? '' : r.ok ? `${r.resultat.lignes.length}${r.resultat.coupe ? '+' : ''} ligne(s) : ${r.resultat.colonnes.map((c) => c.nom).join(', ')}` : ''}</span>
                <span className="espaceur" />
                <button className="discret" onClick={() => modifier({ type: 'requete', nom, sql: null })} aria-label={`Retirer la requête ${nom}`}>
                  <Icone de={Trash2} />
                </button>
              </div>
              <textarea key={dashboard.requetes[nom]} className="code" rows={5} spellCheck={false} aria-label={`SQL de ${nom}`} defaultValue={dashboard.requetes[nom]} onBlur={(e) => e.target.value.trim() && e.target.value !== dashboard.requetes[nom] && modifier({ type: 'requete', nom, sql: e.target.value })} />
              {r && !r.ok && <p className="erreur">{r.erreur}</p>}
            </div>
          )
        })}
        <form
          className="ajout-requete"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nouveau || nomRefuse) return
            modifier({ type: 'requete', nom: nouveau, sql: 'select 1 as valeur' })
            setNouveau('')
          }}
        >
          <input value={nouveau} onChange={(e) => setNouveau(e.target.value.toLowerCase())} placeholder="nom_de_la_requete" aria-label="Nom de la nouvelle requête" />
          <button type="submit" disabled={!nouveau || nomRefuse}>
            <Icone de={Plus} /> Ajouter une requête
          </button>
          {nomRefuse && <span className="erreur">Nom pris ou invalide (minuscules, chiffres, _)</span>}
        </form>
        <h3>Paramètres</h3>
        <EditeurParametres parametres={dashboard.parametres} requetes={noms} etats={Object.keys(dashboard.etats)} changer={(parametres) => modifier({ type: 'parametres', parametres })} />
      </div>
    </Fenetre>
  )
}

function EditeurParametres({ parametres, requetes, etats, changer }: { parametres: Parametre[]; requetes: string[]; etats: string[]; changer: (p: Parametre[]) => void }) {
  const remplacer = (i: number, p: Parametre) => changer(parametres.map((x, k) => (k === i ? p : x)))
  const libre = (n = 1): string => (parametres.some((p) => p.nom === `param_${n}`) ? libre(n + 1) : `param_${n}`)
  return (
    <div className="parametres-analyse">
      {parametres.map((p, i) => (
        <div key={i} className="parametre-analyse">
          <input defaultValue={p.nom} aria-label="Nom" onBlur={(e) => NOM_VALIDE.test(e.target.value) && e.target.value !== p.nom && remplacer(i, { ...p, nom: e.target.value })} />
          <input defaultValue={p.libelle ?? ''} placeholder="Libellé" aria-label="Libellé" onBlur={(e) => remplacer(i, { ...p, libelle: e.target.value.trim() || undefined })} />
          <Choix libelle="Type" valeur={p.type} entrees={TYPES_PARAMETRE.map((t) => ({ valeur: t, libelle: LIBELLES_PARAMETRE[t] }))} changer={(t) => remplacer(i, { nom: p.nom, ...(p.libelle && { libelle: p.libelle }), type: t as TypeParametre })} />
          {p.type === 'choix' && (
            <input
              defaultValue={typeof p.options === 'string' ? p.options : (p.options ?? []).join(', ')}
              placeholder={requetes.length > 0 ? `A, B, C ou ${requetes[0]}` : 'A, B, C'}
              aria-label="Options"
              title="Une liste séparée par des virgules, ou le nom d'une requête dont la première colonne donne les options"
              onBlur={(e) => {
                const v = e.target.value.trim()
                const options = requetes.includes(v) ? v : v.split(',').map((x) => x.trim()).filter(Boolean)
                remplacer(i, { ...p, ...(options.length > 0 ? { options } : { options: undefined }) })
              }}
            />
          )}
          {p.type === 'choix' && (
            <label className="case" title="Des boutons au-dessus du dashboard, pour choisir la ligne d'une fiche ; le choix reste sur cette machine">
              <input type="checkbox" checked={p.affichage === 'boutons'} onChange={(e) => remplacer(i, { ...p, affichage: e.target.checked ? 'boutons' : undefined, ...(!e.target.checked && { pastille: undefined }) })} />
              boutons
            </label>
          )}
          {p.affichage === 'boutons' && etats.length > 0 && (
            <Choix libelle="Pastilles" valeur={p.pastille ?? ''} vide="Sans pastille" entrees={[{ valeur: '', libelle: 'Sans pastille' }, ...etats.map((e) => ({ valeur: e, libelle: `État « ${e} »` }))]} changer={(v) => remplacer(i, { ...p, pastille: v || undefined })} />
          )}
          {p.type === 'mois' && (
            <Choix
              libelle="Par défaut"
              valeur={typeof p.defaut === 'string' && ['courant', 'precedent'].includes(p.defaut) ? p.defaut : ''}
              entrees={[
                { valeur: '', libelle: 'Sans défaut' },
                { valeur: 'courant', libelle: 'Mois courant' },
                { valeur: 'precedent', libelle: 'Mois précédent' },
              ]}
              changer={(v) => remplacer(i, { ...p, defaut: v || undefined })}
            />
          )}
          <button className="discret" onClick={() => changer(parametres.filter((_, k) => k !== i))} aria-label={`Retirer le paramètre ${p.nom}`}>
            <Icone de={Trash2} />
          </button>
        </div>
      ))}
      <button className="discret" onClick={() => changer([...parametres, { nom: libre(), type: 'texte' }])}>
        <Icone de={Plus} /> Ajouter un paramètre
      </button>
    </div>
  )
}
