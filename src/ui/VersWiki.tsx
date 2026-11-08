import { useState, type ReactNode } from 'react'
import { FileText, FolderTree } from 'lucide-react'
import { arbreWiki, type NoeudWiki } from '../core/wiki'
import { useLancer } from './actions'
import { useEspace } from './contexte-espace'
import { Fenetre } from './fenetre'
import { Icone } from './icones'

// « Déplacer vers le wiki » (spec §22) : le corps d'une ligne, ou de chaque
// ligne choisie dans le tableau, devient une page du wiki. Jamais automatique :
// on choisit où ranger les pages, et ce qui reste dans la ligne.

export function FenetreVersWiki(p: { base: string; chemins: readonly string[]; fermer: () => void }) {
  const { espace, etat } = useEspace()
  const lancer = useLancer()
  const [parent, setParent] = useState<string | null>(null)
  const [lien, setLien] = useState(true)
  const depot = etat.bases.get(p.base)?.depot
  const avecCorps = depot?.lignes().filter((l) => p.chemins.includes(l.chemin) && l.corps.trim() !== '').length ?? 0
  const sans = p.chemins.length - avecCorps
  const rangee = (n: NoeudWiki, profondeur: number): ReactNode => (
    <li key={n.page.id}>
      <button className={`option ${parent === n.page.id ? 'choisie' : ''}`} aria-pressed={parent === n.page.id} style={{ paddingLeft: `${0.5 + profondeur}rem` }} onClick={() => setParent(n.page.id)}>
        <Icone de={FileText} />
        {n.page.titre || 'Sans titre'}
      </button>
      {n.enfants.length > 0 && <ul>{n.enfants.map((e) => rangee(e, profondeur + 1))}</ul>}
    </li>
  )
  return (
    <Fenetre titre="Déplacer vers le wiki" fermer={p.fermer}>
      <div className="vers-wiki">
        <p>
          {avecCorps > 1 ? `Le contenu de ${avecCorps} lignes devient ${avecCorps} pages du wiki, une par ligne, à leur titre.` : 'Le contenu de la ligne devient une page du wiki, à son titre.'}
          {sans > 0 && <span className="discret"> {sans > 1 ? `${sans} lignes sans contenu restent telles quelles.` : 'Une ligne sans contenu reste telle quelle.'}</span>}
        </p>
        <h3>Où ranger {avecCorps > 1 ? 'les pages' : 'la page'} ?</h3>
        <ul className="emplacements-wiki">
          <li>
            <button className={`option ${parent === null ? 'choisie' : ''}`} aria-pressed={parent === null} onClick={() => setParent(null)}>
              <Icone de={FolderTree} />
              À la racine du wiki
            </button>
          </li>
          {arbreWiki(etat.wiki.pages).map((n) => rangee(n, 1))}
        </ul>
        <h3>Dans {avecCorps > 1 ? 'chaque ligne' : 'la ligne'}</h3>
        <label className="case-a-cocher">
          <input type="radio" name="reste" checked={lien} onChange={() => setLien(true)} />
          Un lien vers sa page
        </label>
        <label className="case-a-cocher">
          <input type="radio" name="reste" checked={!lien} onChange={() => setLien(false)} />
          Rien : le contenu part entièrement
        </label>
        <div className="boutons">
          <button onClick={p.fermer}>Annuler</button>
          <button
            className="principal"
            disabled={avecCorps === 0}
            onClick={() => {
              p.fermer()
              void lancer(espace.deplacerVersWiki(p.base, p.chemins, parent, lien))
            }}
          >
            Déplacer
          </button>
        </div>
      </div>
    </Fenetre>
  )
}
