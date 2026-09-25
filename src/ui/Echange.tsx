import { useRef, useState, type ChangeEvent } from 'react'
import { Download } from 'lucide-react'
import { domToPng } from 'modern-screenshot'
import { TYPES_CREABLES, type DepotEspace, type TypeCreable } from '../core/depot-espace'
import { deduireColonnes, grilleDeVue, lireCsv, versCsv, versMarkdown, type ColonneImportee, type Libelle } from '../core/echange'
import type { LigneVue } from '../core/filtres'
import { colonnesDeLaVue } from '../core/groupes'
import type { Schema } from '../core/schema'
import type { Vue } from '../core/vue'
import { useLancer } from './actions'
import { champRemonte } from './cellules'
import { titreDe, useEspace } from './contexte-espace'
import { NOMS_TYPES } from './EnteteColonne'
import { Fenetre } from './fenetre'
import { Flottant } from './flottant'
import { Icone } from './icones'

// Import et export (données et image). Tout reste local : le fichier est
// fabriqué dans le navigateur et proposé au téléchargement.

/** Menu « Exporter » d'une vue : ses lignes (filtres et tris appliqués) en Markdown ou CSV, ou son rendu en image. */
export function MenuExporter(p: { espace: DepotEspace; base: string; schema: Schema; vue: Vue; lignesVue: LigneVue[] }) {
  const { etat } = useEspace()
  const lancer = useLancer()
  const ancre = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  const [copie, setCopie] = useState(false)
  const [importer, setImporter] = useState(false)

  const libelle: Libelle = (c, x) => {
    const relation = c.type === 'relation' ? c : champRemonte(etat, p.base, c)
    return relation?.type === 'relation' ? (titreDe(etat, relation.cible, x) ?? x) : x
  }
  const grille = (lisible: boolean) => grilleDeVue(p.lignesVue.map((l) => l.ligne), colonnesDeLaVue(p.schema, p.vue).visibles, libelle, lisible)
  const nomFichier = nettoyerNom(`${p.schema.nom} - ${p.vue.nom}`)
  const fermer = () => {
    setOuvert(false)
    setCopie(false)
  }

  return (
    <>
      <button ref={ancre} className="discret outil" onClick={() => setOuvert(true)}>
        <Icone de={Download} /> Exporter
      </button>
      {ouvert && (
        <Flottant ancre={ancre.current} fermer={fermer}>
          <button
            className="option"
            onClick={() =>
              void lancer(navigator.clipboard.writeText(versMarkdown(grille(true)))).then(() => {
                setCopie(true)
                setTimeout(fermer, 900)
              })
            }
          >
            {copie ? 'Copié dans le presse-papiers' : 'Copier en tableau Markdown'}
          </button>
          <button className="option" onClick={() => (fermer(), telecharger(`${nomFichier}.md`, new Blob([versMarkdown(grille(true))], { type: 'text/markdown' })))}>
            Télécharger en Markdown (.md)
          </button>
          <button
            className="option"
            // BOM : sans lui, Excel lit le CSV en Windows-1252 et casse les accents.
            onClick={() => (fermer(), telecharger(`${nomFichier}.csv`, new Blob(['﻿' + versCsv(grille(false))], { type: 'text/csv' })))}
          >
            Télécharger en CSV
          </button>
          <button
            className="option"
            onClick={() => {
              const depuis = ancre.current
              fermer()
              if (depuis) void lancer(exporterImage(depuis, `${nomFichier}.png`))
            }}
          >
            Télécharger en image (PNG)
          </button>
          <div className="separateur" />
          <button className="option" onClick={() => (fermer(), setImporter(true))}>
            Importer des lignes (CSV)…
          </button>
        </Flottant>
      )}
      {importer && <FenetreImport espace={p.espace} base={p.base} fermer={() => setImporter(false)} />}
    </>
  )
}

function nettoyerNom(nom: string): string {
  return nom.replace(/[\\/:*?"<>|]/g, '-').trim() || 'export'
}

function telecharger(nom: string, contenu: Blob | string) {
  const url = typeof contenu === 'string' ? contenu : URL.createObjectURL(contenu)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  if (typeof contenu !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const imageSuivante = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))

/**
 * Image de la vue entière, pas seulement de sa partie visible : la zone qui
 * défile est déployée à sa taille complète le temps de la capture (les listes
 * virtualisées rendent alors toutes leurs lignes), puis remise en place.
 */
async function exporterImage(depuis: HTMLElement, nom: string) {
  const cible = depuis.closest('.zone-tableau')?.querySelector<HTMLElement>('.tableau, .timeline, .kanban, .calendrier, .collection')
  if (!cible) throw new Error('Rien à capturer dans cette vue')
  const style = cible.getAttribute('style')
  const { scrollWidth: largeur, scrollHeight: hauteur } = cible
  cible.style.cssText += `;overflow: visible; flex: none; width: ${largeur}px; height: ${hauteur}px; max-height: none`
  cible.classList.add('en-capture')
  try {
    await imageSuivante()
    const fond = getComputedStyle(document.documentElement).getPropertyValue('--fond').trim() || '#fff'
    // Un canevas trop grand échoue sans bruit : l'échelle baisse pour les très grandes vues.
    const echelle = Math.min(2, 16000 / Math.max(cible.scrollWidth, cible.scrollHeight))
    telecharger(nom, await domToPng(cible, { scale: echelle, backgroundColor: fond }))
  } finally {
    cible.classList.remove('en-capture')
    if (style === null) cible.removeAttribute('style')
    else cible.setAttribute('style', style)
  }
}

// ── Import ───────────────────────────────────────────────────────

/**
 * Import d'un CSV : dans une nouvelle base (types devinés, modifiables) ou,
 * avec `base`, en lignes ajoutées à une base existante (colonnes retrouvées par nom).
 * Avec `colle`, un tableau collé dans la base prend la place du fichier.
 */
export function FenetreImport(p: {
  espace: DepotEspace
  base?: string
  colle?: { entetes: string[]; cles: (string | null)[]; lignes: string[][] }
  fermer: () => void
  ouvrir?: (base: string) => void
}) {
  const lancer = useLancer()
  const [lu, setLu] = useState<{ fichier: string; entetes: string[]; lignes: string[][] } | null>(
    p.colle ? { fichier: 'Presse-papiers', entetes: p.colle.entetes, lignes: p.colle.lignes } : null,
  )
  const [erreur, setErreur] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [colonnes, setColonnes] = useState<ColonneImportee[]>([])
  const [cles, setCles] = useState<(string | null)[]>(p.colle?.cles ?? [])
  const [enCours, setEnCours] = useState(false)
  const schema = p.base ? p.espace.etat().bases.get(p.base)?.depot?.schema : undefined

  const choisir = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    if (!fichier) return
    const [entetes, ...lignes] = lireCsv(await fichier.text())
    if (!entetes || lignes.length === 0) {
      setErreur('Ce fichier ne contient aucune ligne de données (la première ligne sert d’en-têtes).')
      return
    }
    setErreur(null)
    setLu({ fichier: fichier.name, entetes, lignes })
    setNom(fichier.name.replace(/\.[^.]+$/, ''))
    setColonnes(deduireColonnes(entetes, lignes))
    if (p.base) setCles(p.espace.correspondances(p.base, entetes))
  }

  const importer = async () => {
    if (!lu) return
    setEnCours(true)
    if (p.base) {
      await lancer(p.espace.importerLignes(p.base, cles, lu.lignes))
    } else {
      const id = await lancer(p.espace.importerBase(nom, colonnes, lu.lignes))
      if (id) p.ouvrir?.(id)
    }
    setEnCours(false)
    p.fermer()
  }

  const modifierColonne = (i: number, m: Partial<ColonneImportee>) => setColonnes(colonnes.map((c, j) => (j === i ? { ...c, ...m } : c)))
  const apercu = (i: number) =>
    lu!.lignes
      .map((l) => l[i] ?? '')
      .filter((v) => v.trim() !== '')
      .slice(0, 3)
      .join(' · ')
  const saisissables = schema?.colonnes.filter((c) => (TYPES_CREABLES as readonly string[]).includes(c.type)) ?? []

  return (
    <Fenetre
      titre={p.colle ? `Coller des lignes dans ${schema?.nom ?? p.base}` : p.base ? `Importer des lignes dans ${schema?.nom ?? p.base}` : 'Nouvelle base depuis un CSV'}
      fermer={p.fermer}
    >
      <div className="import">
        {!p.colle && (
          <label className="choix-fichier">
            <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void choisir(e)} />
          </label>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        {lu && (
          <>
            <p className="discret">
              {lu.fichier} : {lu.lignes.length} ligne{lu.lignes.length > 1 ? 's' : ''}, {lu.entetes.length} colonne{lu.entetes.length > 1 ? 's' : ''}.
              {p.colle
                ? ' Chaque colonne collée va dans la colonne choisie ; « Ignorer » la laisse de côté.'
                : p.base
                  ? ' Chaque colonne du fichier va dans la colonne de même nom ; les autres sont ignorées.'
                  : ' La première colonne devient le titre.'}
            </p>
            {!p.base && (
              <label className="case-reglage">
                Nom de la base
                <input value={nom} onChange={(e) => setNom(e.target.value)} />
              </label>
            )}
            <table className="colonnes-import">
              <thead>
                <tr>
                  <th>{p.colle ? 'Colonne collée' : 'Colonne du fichier'}</th>
                  <th>{p.base ? 'Va dans' : 'Type'}</th>
                  <th>Aperçu</th>
                </tr>
              </thead>
              <tbody>
                {lu.entetes.map((entete, i) => (
                  <tr key={i}>
                    <td>
                      {p.base ? (
                        entete
                      ) : (
                        <input value={colonnes[i]!.nom} onChange={(e) => modifierColonne(i, { nom: e.target.value })} aria-label={`Nom de la colonne ${i + 1}`} />
                      )}
                    </td>
                    <td>
                      {p.base ? (
                        <select value={cles[i] ?? ''} onChange={(e) => setCles(cles.map((c, j) => (j === i ? e.target.value || null : c)))} aria-label={`Destination de ${entete}`}>
                          <option value="">Ignorer</option>
                          {saisissables.map((c) => (
                            <option key={c.cle} value={c.cle}>
                              {c.nom}
                            </option>
                          ))}
                        </select>
                      ) : i === 0 ? (
                        <span className="discret">Titre</span>
                      ) : (
                        <select
                          value={colonnes[i]!.type}
                          onChange={(e) => modifierColonne(i, { type: e.target.value as TypeCreable })}
                          aria-label={`Type de ${colonnes[i]!.nom}`}
                        >
                          {TYPES_CREABLES.map((t) => (
                            <option key={t} value={t}>
                              {NOMS_TYPES[t]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="discret apercu-import">{apercu(i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="boutons">
              <button className="discret" onClick={p.fermer}>
                Annuler
              </button>
              <button
                className="principal"
                disabled={enCours || (p.base ? cles.every((c) => c === null) : nom.trim() === '')}
                onClick={() => void importer()}
              >
                {enCours ? 'Import…' : `${p.colle ? 'Coller' : 'Importer'} ${lu.lignes.length} ligne${lu.lignes.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Fenetre>
  )
}
