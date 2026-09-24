import { useRef, useState, type ReactNode } from 'react'
import type { DepotEspace } from '../core/depot-espace'
import type { Schema } from '../core/schema'
import type { FiltreRapide, Tri, Vue } from '../core/vue'
import { useLancer } from './actions'
import { ChampTexte, colonnesFiltrables, EditeurFiltres } from './EditeurFiltres'
import { Flottant } from './flottant'

type Props = {
  espace: DepotEspace
  base: string
  schema: Schema
  vues: Vue[]
  vue: Vue
  choisirVue: (id: string) => void
  actifs: ReadonlySet<string>
  basculer: (nom: string) => void
}

/** Onglets de vues, filtres rapides, et panneaux Filtrer / Trier (spec §7). */
export function BarreVue({ espace, base, schema, vues, vue, choisirVue, actifs, basculer }: Props) {
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
          <Panneau libelle="Filtres rapides" actif={false}>
            <EditeurFiltresRapides
              schema={schema}
              rapides={vue.filtresRapides}
              changer={(filtresRapides) => modifier({ filtresRapides })}
            />
          </Panneau>
        </div>
      </div>

      {vue.filtresRapides.length > 0 && (
        <div className="filtres-rapides">
          {vue.filtresRapides.map((r) => (
            <button key={r.nom} className={`pilule ${actifs.has(r.nom) ? 'active' : ''}`} onClick={() => basculer(r.nom)}>
              {r.nom}
            </button>
          ))}
        </div>
      )}
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

function EditeurFiltresRapides(p: { schema: Schema; rapides: FiltreRapide[]; changer: (r: FiltreRapide[]) => void }) {
  const remplacer = (i: number, r: FiltreRapide) => p.changer(p.rapides.map((x, j) => (j === i ? r : x)))
  return (
    <div className="editeur-filtres">
      {p.rapides.map((r, i) => (
        <fieldset key={i} className="filtre-rapide">
          <legend>
            <ChampTexte
              valeur={r.nom}
              placeholder="nom"
              changer={(v) => {
                const nom = v.trim()
                if (nom && nom !== r.nom && !p.rapides.some((x) => x.nom === nom)) remplacer(i, { ...r, nom })
              }}
            />
            <button className="discret" onClick={() => p.changer(p.rapides.filter((_, j) => j !== i))} aria-label="Supprimer le filtre rapide">
              ×
            </button>
          </legend>
          <EditeurFiltres schema={p.schema} filtres={r.filtres} changer={(filtres) => remplacer(i, { ...r, filtres })} />
        </fieldset>
      ))}
      <button
        className="discret ajout-filtre"
        onClick={() => {
          let n = p.rapides.length + 1
          while (p.rapides.some((r) => r.nom === `Filtre ${n}`)) n++
          p.changer([...p.rapides, { nom: `Filtre ${n}`, filtres: [] }])
        }}
      >
        + Nouveau filtre rapide
      </button>
    </div>
  )
}
