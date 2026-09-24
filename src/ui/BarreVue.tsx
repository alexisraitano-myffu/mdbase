import { useRef, useState, type ReactNode } from 'react'
import type { DepotEspace } from '../core/depot-espace'
import type { Schema } from '../core/schema'
import { colonnesDeLaVue, groupables } from '../core/groupes'
import type { ModificationVue, Tri, Vue } from '../core/vue'
import { useLancer } from './actions'
import { colonnesFiltrables, EditeurFiltres } from './EditeurFiltres'
import { Flottant } from './flottant'
import { ICONES } from './EnteteColonne'
import { Pastilles } from './Pastilles'

type Props = {
  espace: DepotEspace
  base: string
  schema: Schema
  vues: Vue[]
  vue: Vue
  choisirVue: (id: string) => void
}

/** Onglets de vues, panneaux Filtrer / Trier, et pastilles de filtres rapides (spec §7). */
export function BarreVue({ espace, base, schema, vues, vue, choisirVue }: Props) {
  const lancer = useLancer()
  const modifier = (m: Parameters<DepotEspace['modifierVue']>[2]) => void lancer(espace.modifierVue(base, vue.id, m))

  return (
    <div className="barre-vue">
      <div className="onglets">
        {vues.map((v) => (
          <Onglet
            key={v.id}
            vue={v}
            active={v.id === vue.id}
            choisir={() => choisirVue(v.id)}
            renommer={(nom) => void lancer(espace.modifierVue(base, v.id, { nom }))}
            supprimer={vues.length > 1 ? () => void lancer(espace.supprimerVue(base, v.id)) : undefined}
          />
        ))}
        <button
          className="discret onglet-ajout"
          title="Nouvelle vue tableau"
          onClick={async () => {
            const id = await lancer(espace.creerVue(base, `Tableau ${vues.length + 1}`))
            if (id) choisirVue(id)
          }}
        >
          +
        </button>

        <div className="outils-vue">
          <Panneau libelle={`Filtrer${vue.filtres.length ? ` (${vue.filtres.length})` : ''}`} actif={vue.filtres.length > 0}>
            <EditeurFiltres schema={schema} filtres={vue.filtres} changer={(filtres) => modifier({ filtres })} />
          </Panneau>
          <Panneau libelle={`Trier${vue.tris.length ? ` (${vue.tris.length})` : ''}`} actif={vue.tris.length > 0}>
            <EditeurTris schema={schema} tris={vue.tris} changer={(tris) => modifier({ tris })} />
          </Panneau>
          <Panneau libelle="Options" actif={false}>
            <OptionsVue schema={schema} vue={vue} modifier={modifier} />
          </Panneau>
        </div>
      </div>

      <Pastilles schema={schema} pastilles={vue.filtresRapides} changer={(filtresRapides) => modifier({ filtresRapides })} />
    </div>
  )
}

function Onglet(p: { vue: Vue; active: boolean; choisir: () => void; renommer: (nom: string) => void; supprimer?: (() => void) | undefined }) {
  const [edition, setEdition] = useState(false)
  const [menu, setMenu] = useState(false)
  const ancre = useRef<HTMLDivElement>(null)
  if (edition) {
    return (
      <input
        className="champ-en-ligne"
        autoFocus
        defaultValue={p.vue.nom}
        onBlur={(e) => {
          setEdition(false)
          const nom = e.target.value.trim()
          if (nom && nom !== p.vue.nom) p.renommer(nom)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEdition(false)
        }}
      />
    )
  }
  return (
    <div
      ref={ancre}
      className={`onglet ${p.active ? 'actif' : ''}`}
      onClick={p.choisir}
      onDoubleClick={() => setEdition(true)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu(true)
      }}
      title="Double-clic pour renommer, clic droit pour plus"
    >
      {p.vue.nom}
      {menu && (
        <Flottant ancre={ancre.current} fermer={() => setMenu(false)}>
          <button className="option" onClick={() => (setMenu(false), setEdition(true))}>
            Renommer
          </button>
          {p.supprimer ? (
            <button className="option danger-texte" onClick={() => (setMenu(false), p.supprimer!())}>
              Supprimer la vue
            </button>
          ) : (
            <div className="option discret">Dernière vue : non supprimable</div>
          )}
        </Flottant>
      )}
    </div>
  )
}

function Panneau({ libelle, actif, children }: { libelle: string; actif: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const ancre = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ancre} className={`discret outil ${actif ? 'actif' : ''}`} onClick={() => setOuvert(true)}>
        {libelle}
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={() => setOuvert(false)}>
          <div className="panneau">{children}</div>
        </Flottant>
      )}
    </>
  )
}

function EditeurTris({ schema, tris, changer }: { schema: Schema; tris: Tri[]; changer: (t: Tri[]) => void }) {
  const colonnes = colonnesFiltrables(schema)
  const libres = colonnes.filter((c) => !tris.some((t) => t.colonne === c.cle))
  return (
    <div className="editeur-filtres">
      {tris.length === 0 && <div className="discret">Aucun tri : ordre des fichiers</div>}
      {tris.map((t, i) => (
        <div key={t.colonne} className="ligne-filtre">
          <select
            value={t.colonne}
            onChange={(e) => changer(tris.map((x, j) => (j === i ? { ...x, colonne: e.target.value } : x)))}
          >
            {colonnes
              .filter((c) => c.cle === t.colonne || libres.includes(c))
              .map((c) => (
                <option key={c.cle} value={c.cle}>
                  {c.nom}
                </option>
              ))}
          </select>
          <select
            value={t.sens}
            onChange={(e) => changer(tris.map((x, j) => (j === i ? { ...x, sens: e.target.value as Tri['sens'] } : x)))}
          >
            <option value="asc">croissant</option>
            <option value="desc">décroissant</option>
          </select>
          <button className="discret" onClick={() => changer(tris.filter((_, j) => j !== i))} aria-label="Retirer le tri">
            ×
          </button>
        </div>
      ))}
      {libres[0] && (
        <button className="discret ajout-filtre" onClick={() => changer([...tris, { colonne: libres[0]!.cle, sens: 'asc' }])}>
          + Ajouter un tri
        </button>
      )}
    </div>
  )
}

/** Réglages d'affichage du tableau : groupement, retour à la ligne, colonnes affichées (spec §7). */
function OptionsVue({ schema, vue, modifier }: { schema: Schema; vue: Vue; modifier: (m: ModificationVue) => void }) {
  const { visibles, masquees } = colonnesDeLaVue(schema, vue)
  const toutes = [...visibles, ...masquees]
  const cachees = new Set(masquees.map((c) => c.cle))
  return (
    <div className="editeur-filtres">
      <label className="case-reglage">
        Grouper par
        <select value={vue.groupe ?? ''} onChange={(e) => modifier({ groupe: e.target.value || undefined })}>
          <option value="">aucun groupement</option>
          {groupables(schema).map((c) => (
            <option key={c.cle} value={c.cle}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="case-reglage">
        <input type="checkbox" checked={vue.retourLigne === true} onChange={(e) => modifier({ retourLigne: e.target.checked })} />
        Retour à la ligne dans les cellules
      </label>
      <div className="titre-section">Colonnes affichées</div>
      {toutes.map((c) => (
        <label key={c.cle} className="case-reglage">
          <input
            type="checkbox"
            checked={!cachees.has(c.cle)}
            disabled={c.cle === schema.champTitre}
            onChange={(e) =>
              modifier({
                masquees: e.target.checked ? masquees.map((x) => x.cle).filter((x) => x !== c.cle) : [...masquees.map((x) => x.cle), c.cle],
              })
            }
          />
          <span className="icone">{ICONES[c.type]}</span>
          {c.nom}
        </label>
      ))}
    </div>
  )
}
