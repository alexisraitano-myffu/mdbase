import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Command, Keyboard } from 'lucide-react'
import { estChampDeSaisie } from './clavier'
import { Fenetre } from './fenetre'
import { flottantOuvert } from './flottant'
import { Icone } from './icones'

// Aide des raccourcis clavier (spec §12) : la liste de tous les raccourcis de
// l'app, ouverte par le bouton en haut à droite ou par « ? ». Un raccourci
// ajouté ailleurs dans l'interface s'ajoute aussi ici.

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** Une touche : `mod` (Ctrl, ou Cmd sur Mac), `haut` / `bas` (flèches), ou son nom tel qu'il s'affiche. */
type Touche = 'mod' | 'haut' | 'bas' | string
/** Plusieurs combinaisons : au choix (« ou »), ou deux gestes distincts de la même action (`et`). */
type Raccourci = { touches: Touche[][]; action: string; et?: true }
type Groupe = { titre: string; raccourcis: Raccourci[] }

const GROUPES: Groupe[] = [
  {
    titre: 'Partout',
    raccourcis: [
      { touches: [['mod', 'K']], action: 'Rechercher dans tout l’espace' },
      { touches: [['mod', 'J']], action: 'Ouvrir ou fermer le panneau de l’assistant IA' },
      { touches: [['mod', 'E']], action: 'Passer de l’édition à la consultation, et retour' },
      { touches: [['mod', 'Z']], action: 'Annuler la dernière modification' },
      { touches: [['mod', 'Maj', 'Z'], ['mod', 'Y']], action: 'Rétablir' },
      { touches: [['?']], action: 'Afficher ces raccourcis' },
      { touches: [['Échap']], action: 'Fermer un menu, une fenêtre ou une page ; quitter le plein écran' },
    ],
  },
  {
    titre: 'Tableau',
    raccourcis: [
      { touches: [['Maj', 'clic']], action: 'Étendre la sélection de cases (ou de lignes, sur leurs cases à cocher)' },
      { touches: [['mod', 'C'], ['mod', 'V']], action: 'Copier, coller une plage de cases', et: true },
      { touches: [['Suppr']], action: 'Vider la plage de cases, ou supprimer les lignes cochées' },
      { touches: [['Entrée']], action: 'Valider la saisie d’une case' },
    ],
  },
  {
    titre: 'Page d’une ligne',
    raccourcis: [{ touches: [['haut'], ['bas']], action: 'Passer à la ligne précédente ou suivante de la vue' }],
  },
  {
    titre: 'Contenu d’une page',
    raccourcis: [
      { touches: [['/']], action: 'Insérer un bloc : titre, tâche, liste, citation, code' },
      { touches: [['mod', 'B'], ['mod', 'I']], action: 'Mettre en gras, en italique', et: true },
      { touches: [['mod', 'K']], action: 'Sur un texte sélectionné : en faire un lien ; sur un lien : changer ou retirer son adresse' },
      { touches: [['mod', 'Maj', 'H']], action: 'Surligner en jaune, ou retirer le surlignage (autres couleurs : clic droit)' },
      { touches: [['clic droit']], action: 'Sur un mot ou une sélection : mise en forme, surlignage, couper, copier, coller' },
      { touches: [['Entrée']], action: 'Dans une liste ou une tâche : continuer avec un nouvel élément' },
      { touches: [['Tab'], ['Maj', 'Tab']], action: 'Décaler un élément de liste, et retour', et: true },
      { touches: [MAC ? ['mod', 'Alt', '['] : ['mod', 'Maj', '['], MAC ? ['mod', 'Alt', ']'] : ['mod', 'Maj', ']']], action: 'Replier, déplier le titre sous le curseur', et: true },
    ],
  },
  {
    titre: 'Timeline',
    raccourcis: [
      { touches: [['mod', 'molette']], action: 'Zoomer sous le pointeur (ou pincer le trackpad)' },
      { touches: [['+'], ['-']], action: 'Zoomer, dézoomer', et: true },
      { touches: [['0']], action: 'Revenir à l’échelle choisie' },
      { touches: [['Échap']], action: 'Annuler un glisser en cours' },
    ],
  },
  {
    titre: 'Listes, recherche et formules',
    raccourcis: [
      { touches: [['haut'], ['bas']], action: 'Parcourir les choix' },
      { touches: [['Entrée']], action: 'Choisir' },
      { touches: [['Tab']], action: 'Compléter une formule' },
      { touches: [['mod', 'Entrée']], action: 'Valider une formule' },
    ],
  },
  {
    titre: 'Assistant IA',
    raccourcis: [
      { touches: [['Entrée']], action: 'Envoyer la demande' },
      { touches: [['Maj', 'Entrée']], action: 'Aller à la ligne' },
      { touches: [['@']], action: 'Citer une base : ses lignes accompagnent la demande' },
      { touches: [['/']], action: 'Lancer un skill (en tête de demande)' },
      { touches: [['haut'], ['bas']], action: 'Parcourir les bases ou les skills proposés ; Entrée ou Tab pour choisir' },
      { touches: [['Retour arrière']], action: 'En tête de demande : retirer la dernière base ou le skill cités' },
    ],
  },
]

function Touches({ touches }: { touches: Touche[] }) {
  const une = (t: Touche): ReactNode => {
    if (t === 'mod') return MAC ? <Icone de={Command} taille={12} /> : 'Ctrl'
    if (t === 'haut') return <Icone de={ArrowUp} taille={12} />
    if (t === 'bas') return <Icone de={ArrowDown} taille={12} />
    return t
  }
  return (
    <span className="combinaison">
      {touches.map((t, i) => (
        <kbd key={i} className="touche">
          {une(t)}
        </kbd>
      ))}
    </span>
  )
}

/** Bouton de l'aide, en haut à droite, et son raccourci « ? » (hors saisie, menu et fenêtre). */
export function AideRaccourcis() {
  const [ouverte, setOuverte] = useState<null | 'clic' | 'clavier'>(null)
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || estChampDeSaisie(e.target) || flottantOuvert()) return
      if (document.querySelector('.voile-fenetre, .voile-recherche')) return
      e.preventDefault()
      setOuverte('clavier')
    }
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  }, [])
  return (
    <>
      <button className="discret bascule-mode" onClick={() => setOuverte('clic')} title="Raccourcis clavier (?)" aria-label="Raccourcis clavier">
        <Icone de={Keyboard} taille={17} />
      </button>
      {ouverte && (
        <Fenetre titre="Raccourcis clavier" fermer={() => setOuverte(null)} immediate={ouverte === 'clavier'}>
          <div className="raccourcis">
            {GROUPES.map((g) => (
              <section key={g.titre} className="groupe-raccourcis">
                <h3>{g.titre}</h3>
                {g.raccourcis.map((r) => (
                  <div key={r.action} className="raccourci">
                    <span>{r.action}</span>
                    <span className="touches-raccourci">
                      {r.touches.map((c, i) => (
                        <span key={i} className="combinaison">
                          {i > 0 && <span className="discret">{r.et ? 'et' : 'ou'}</span>}
                          <Touches touches={c} />
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </Fenetre>
      )}
    </>
  )
}
