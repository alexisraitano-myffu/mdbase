import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { DepotEspace } from '../core/depot-espace'
import { FONCTIONS, NOMS_TYPES } from '../core/formules/fonctions'
import {
  afficherExpression,
  compiler,
  enTexte,
  ErreurCalcul,
  ErreurFormule,
  evaluer,
  resoudreParNom,
  stockerExpression,
  typeDeColonne,
  type TypeFormule,
} from '../core/formules/formule'
import type { Colonne, ColonneFormule } from '../core/schema'
import type { Cellule } from '../core/valeurs'
import { ICONES } from './EnteteColonne'
import { useEspace } from './contexte-espace'
import { useAujourdhui } from './useAujourdhui'

type Props = {
  espace: DepotEspace
  base: string
  /** Formule modifiée ; absente pour une création. */
  formule?: ColonneFormule
  enregistrer: (expression: string) => void
  annuler: () => void
}

type Suggestion = { libelle: string; detail: string; icone: string; inserer: string; /** Recul du curseur après insertion (dans les parenthèses). */ recul: number }

const sansAccents = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Éditeur de formule (spec §6) : on écrit avec les noms des colonnes, le fichier
 * garde les clés. Autocomplétion des colonnes et des fonctions, erreur en
 * français avec la partie fautive, aperçu du résultat sur une ligne de la base.
 */
export function EditeurFormule({ espace, base, formule, enregistrer, annuler }: Props) {
  const { etat } = useEspace()
  const aujourdhui = useAujourdhui()
  const schema = etat.bases.get(base)!.depot!.schema
  // La formule ne se lit pas elle-même : elle n'apparaît ni dans les suggestions ni dans les noms résolus.
  const colonnes = useMemo(() => schema.colonnes.filter((c) => c.cle !== formule?.cle), [schema, formule?.cle])
  const [texte, setTexte] = useState(() => (formule ? afficherExpression(formule.expression, schema.colonnes) : ''))
  const [curseur, setCurseur] = useState(texte.length)
  const [choisie, setChoisie] = useState(0)
  const [sansSuggestions, setSansSuggestions] = useState(false)
  const [iLigne, setILigne] = useState(0)
  const zone = useRef<HTMLTextAreaElement>(null)

  // ── Diagnostic : syntaxe et types avec la position, puis boucles côté espace.
  const diagnostic = useMemo(() => {
    if (texte.trim() === '') return { vide: true as const }
    try {
      const compilee = compiler(texte, resoudreParNom(colonnes))
      const probleme = espace.essayerFormule(base, formule?.cle ?? null, stockerExpression(texte, colonnes))
      if (probleme) return { erreur: probleme }
      return { compilee }
    } catch (e) {
      if (e instanceof ErreurFormule) return { erreur: e.message, position: e.position }
      throw e
    }
  }, [texte, colonnes, espace, base, formule?.cle])

  // ── Aperçu sur une ligne de la base, avec ses colonnes calculées.
  const lignes = etat.bases.get(base)!.depot!.lignes()
  const ligne = lignes[Math.min(iLigne, lignes.length - 1)]
  const apercu = useMemo(() => {
    if (!('compilee' in diagnostic) || !diagnostic.compilee || !ligne) return null
    const calculees = etat.calculs.get(base)?.get(ligne.id) ?? {}
    const cellule = (c: Colonne): Cellule | undefined => calculees[c.cle] ?? ligne.cellules[c.cle]
    try {
      const v = evaluer(
        diagnostic.compilee,
        (c) => {
          const x = cellule(c)
          if (!x) return c.type === 'checkbox' ? false : undefined
          if (x.etat === 'invalide') throw new ErreurCalcul(`« ${c.nom} » : ${x.raison}`)
          return typeof x.valeur === 'string' && x.valeur === '' ? undefined : (x.valeur as string | number | boolean)
        },
        { aujourdhui, maintenant: `${aujourdhui}T00:00` },
      )
      return { valeur: v === undefined ? 'vide' : enTexte(v) }
    } catch (e) {
      if (e instanceof ErreurCalcul) return { erreur: e.message }
      throw e
    }
  }, [diagnostic, ligne, etat, base, aujourdhui])

  // ── Autocomplétion : mot en cours avant le curseur, ou nom de colonne dans prop("…
  const avant = texte.slice(0, curseur)
  const dansProp = /prop\(\s*"([^"]*)$/.exec(avant)
  const mot = dansProp ? null : /[\p{L}_][\p{L}\p{N}_]*$/u.exec(avant)
  const suggestions = useMemo((): Suggestion[] => {
    if (sansSuggestions) return []
    const colonneSuggeree = (c: Colonne): Suggestion => {
      const t = typeDeColonne(c)
      return {
        libelle: c.nom,
        detail: typeof t === 'string' ? 'plusieurs valeurs : non utilisable' : NOMS_TYPES[t],
        icone: ICONES[c.type],
        inserer: `prop("${c.nom.replace(/"/g, '\\"')}")`,
        recul: 0,
      }
    }
    if (dansProp) {
      const q = sansAccents(dansProp[1]!)
      return colonnes.filter((c) => sansAccents(c.nom).includes(q)).slice(0, 8).map(colonneSuggeree)
    }
    if (!mot) return []
    const q = sansAccents(mot[0])
    const fonctions = [...FONCTIONS].filter(([nom]) => nom.startsWith(q)).map(
      ([nom, f]): Suggestion => ({
        libelle: f.signature,
        detail: f.description,
        icone: 'ƒ',
        inserer: `${nom}()`,
        recul: f.args.length === 0 ? 0 : 1,
      }),
    )
    const cols = colonnes.filter((c) => sansAccents(c.nom).includes(q)).map(colonneSuggeree)
    const exacte = fonctions.length === 1 && fonctions[0]!.libelle.startsWith(`${mot[0]}(`)
    return exacte ? [] : [...cols, ...fonctions].slice(0, 8)
  }, [dansProp?.[1], mot?.[0], colonnes, sansSuggestions])

  const inserer = (s: Suggestion) => {
    const debut = dansProp ? avant.length - dansProp[0].length : avant.length - (mot?.[0].length ?? 0)
    // Dans prop(" : on remplace aussi la fin éventuelle `")` déjà tapée.
    const apres = texte.slice(curseur).replace(dansProp ? /^[^"]*"?\s*\)?/ : /^$/, '')
    const nouveau = texte.slice(0, debut) + s.inserer + apres
    const position = debut + s.inserer.length - s.recul
    setTexte(nouveau)
    setChoisie(0)
    requestAnimationFrame(() => {
      zone.current?.focus()
      zone.current?.setSelectionRange(position, position)
      setCurseur(position)
    })
  }

  // ── Aide de la fonction dans laquelle se trouve le curseur.
  const fonctionCourante = useMemo(() => {
    let profondeur = 0
    for (let i = avant.length - 1; i >= 0; i--) {
      if (avant[i] === ')') profondeur++
      else if (avant[i] === '(') {
        if (profondeur === 0) {
          const nom = /[\p{L}_][\p{L}\p{N}_]*$/u.exec(avant.slice(0, i))?.[0]
          return nom ? FONCTIONS.get(nom) : undefined
        }
        profondeur--
      }
    }
    return undefined
  }, [avant])

  const valide = 'compilee' in diagnostic && diagnostic.compilee !== undefined
  const valider = () => valide && enregistrer(stockerExpression(texte, colonnes))

  const clavier = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      valider()
      return
    }
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setChoisie((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      inserer(suggestions[Math.min(choisie, suggestions.length - 1)]!)
    } else if (e.key === 'Escape') {
      // Ferme la liste, pas le panneau.
      e.stopPropagation()
      setSansSuggestions(true)
    }
  }

  const erreur = 'erreur' in diagnostic ? diagnostic : null
  const type: TypeFormule | undefined = valide ? diagnostic.compilee!.type : undefined

  return (
    <div className="editeur-formule">
      <textarea
        ref={zone}
        className="zone-formule"
        autoFocus
        spellCheck={false}
        rows={3}
        value={texte}
        placeholder='Ex. si(prop("Fait"), 0, prop("Heures")) : tape un nom de colonne ou de fonction'
        onChange={(e) => {
          setTexte(e.target.value)
          setCurseur(e.target.selectionStart)
          setChoisie(0)
          setSansSuggestions(false)
        }}
        onSelect={(e) => setCurseur(e.currentTarget.selectionStart)}
        onKeyDown={clavier}
      />
      {suggestions.length > 0 && (
        <div className="suggestions-formule">
          {suggestions.map((s, i) => (
            <button
              key={s.libelle}
              className={`option ${i === choisie ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => inserer(s)}
              onMouseEnter={() => setChoisie(i)}
            >
              <span className="icone">{s.icone}</span>
              <span className="libelle-suggestion">{s.libelle}</span>
              <span className="discret detail-suggestion">{s.detail}</span>
            </button>
          ))}
        </div>
      )}
      {fonctionCourante && suggestions.length === 0 && (
        <div className="aide-formule">
          <code>{fonctionCourante.signature}</code> {fonctionCourante.description}
        </div>
      )}
      {erreur && (
        <div className="erreur-formule">
          {erreur.erreur}
          {erreur.position && erreur.position.fin > erreur.position.debut && (
            <code className="extrait-formule">
              {texte.slice(Math.max(0, erreur.position.debut - 20), erreur.position.debut)}
              <mark>{texte.slice(erreur.position.debut, erreur.position.fin)}</mark>
              {texte.slice(erreur.position.fin, erreur.position.fin + 20)}
            </code>
          )}
        </div>
      )}
      {valide && ligne && (
        <div className="apercu-formule">
          <span className="discret">
            {type && `Résultat : ${NOMS_TYPES[type]}. `}Sur « {titreLigne(ligne.cellules[schema.champTitre])} »
          </span>
          <strong className={apercu && 'erreur' in apercu ? 'invalide' : ''}>{apercu && ('erreur' in apercu ? `⚠ ${apercu.erreur}` : apercu.valeur)}</strong>
          {lignes.length > 1 && (
            <span className="navigation-apercu">
              <button className="discret" onClick={() => setILigne((i) => (i + lignes.length - 1) % lignes.length)} aria-label="Ligne précédente">
                ‹
              </button>
              <button className="discret" onClick={() => setILigne((i) => (i + 1) % lignes.length)} aria-label="Ligne suivante">
                ›
              </button>
            </span>
          )}
        </div>
      )}
      <div className="boutons">
        <span className="discret raccourci">⌘ Entrée pour enregistrer</span>
        <button onClick={annuler}>Annuler</button>
        <button className="principal" disabled={!valide} onClick={valider}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

function titreLigne(c: Cellule | undefined): string {
  return c?.etat === 'ok' && String(c.valeur) !== '' ? String(c.valeur) : 'Sans titre'
}

