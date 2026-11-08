import { useContext } from 'react'
import { FileText, Rows3 } from 'lucide-react'
import type { SourceLien } from '../core/index-liens'
import { DOSSIER_WIKI } from '../core/wiki'
import { ContexteOuvrir, titreDe, useEspace } from './contexte-espace'
import { Icone } from './icones'

// Rétroliens (spec §22) : les lignes et pages du wiki qui citent ce qu'on
// regarde, d'après l'index des liens tenu en mémoire. Seulement leurs titres :
// la page d'une ligne ne montre jamais le contenu du wiki.

export function Retroliens({ cible, titre }: { cible: SourceLien; titre: string }) {
  const { espace, etat } = useEspace()
  const ouvrir = useContext(ContexteOuvrir)
  const sources = espace.citant(cible)
  if (sources.length === 0) return null
  const pages = etat.wiki.pages
  const libelle = (s: SourceLien) =>
    s.base === DOSSIER_WIKI ? (pages.find((p) => p.id === s.id)?.titre || 'Sans titre') : (titreDe(etat, s.base, s.id) ?? 'Sans titre')
  const nomBase = (base: string) => (base === DOSSIER_WIKI ? 'Wiki' : (etat.bases.get(base)?.depot?.schema.nom ?? base))
  const tries = [...sources].sort((a, b) => Number(a.base !== DOSSIER_WIKI) - Number(b.base !== DOSSIER_WIKI) || libelle(a).localeCompare(libelle(b), 'fr'))
  return (
    <section className="retroliens" aria-label={titre}>
      <h2>
        {titre} <span className="compte-section">{sources.length}</span>
      </h2>
      <ul>
        {tries.map((s) => (
          <li key={`${s.base}/${s.id}`}>
            <button className="discret" onClick={() => ouvrir?.(s.base, s.id)}>
              <Icone de={s.base === DOSSIER_WIKI ? FileText : Rows3} />
              <span className="titre-retrolien">{libelle(s)}</span>
              <span className="base-retrolien">{nomBase(s.base)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
