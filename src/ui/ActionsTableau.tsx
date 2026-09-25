import { useRef, useState } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotEspace, Remplacement } from '../core/depot-espace'
import { useLancer } from './actions'
import { Fenetre } from './fenetre'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { Copy, CopyPlus, Trash2, X } from 'lucide-react'

// Actions du tableau sur plusieurs lignes ou cellules (spec §7, « plusieurs lignes à la fois »).

/** Barre des lignes sélectionnées : copier, dupliquer, supprimer (avec les liens vers elles, spec §5). */
export function BarreSelection(p: {
  espace: DepotEspace
  base: string
  choisies: LigneChargee[]
  confirmer: boolean
  setConfirmer: (v: boolean) => void
  copier: () => Promise<void>
  dupliquer: () => Promise<void>
  supprimer: (nettoyer: boolean) => Promise<void>
  vider: () => void
}) {
  const lancer = useLancer()
  const bouton = useRef<HTMLButtonElement>(null)
  const [nettoyer, setNettoyer] = useState(true)
  const [copie, setCopie] = useState(false)
  const n = p.choisies.length
  const pluriel = n > 1 ? 's' : ''
  const liens = p.confirmer ? [...new Set(p.choisies.map((l) => l.id))].reduce((t, id) => t + p.espace.liensVers(p.base, id).length, 0) : 0

  return (
    <div className="barre-selection" role="toolbar" aria-label="Lignes sélectionnées">
      <span className="compte-selection">
        {n} ligne{pluriel} sélectionnée{pluriel}
      </span>
      {n > 1 && <span className="discret astuce-selection">Une cellule modifiée l’est sur toutes</span>}
      <button
        className="discret"
        onClick={() =>
          void lancer(p.copier()).then(() => {
            setCopie(true)
            setTimeout(() => setCopie(false), 1200)
          })
        }
      >
        <Icone de={Copy} /> {copie ? 'Copié' : 'Copier'}
      </button>
      <button className="discret" onClick={() => void p.dupliquer()}>
        <Icone de={CopyPlus} /> Dupliquer
      </button>
      <button ref={bouton} className="discret danger-texte" onClick={() => p.setConfirmer(true)}>
        <Icone de={Trash2} /> Supprimer
      </button>
      <button className="discret" onClick={p.vider} aria-label="Désélectionner">
        <Icone de={X} />
      </button>
      {p.confirmer && (
        <Flottant ancre={bouton.current} fermer={() => p.setConfirmer(false)}>
          <div className="confirmation">
            <p>
              Supprimer {n > 1 ? `ces ${n} lignes` : 'cette ligne'} ? {n > 1 ? 'Leurs fichiers sont effacés' : 'Son fichier est effacé'} du dossier <code>{p.base}</code>.
            </p>
            {liens > 0 && (
              <label className="case-a-cocher">
                <input type="checkbox" checked={nettoyer} onChange={(e) => setNettoyer(e.target.checked)} />
                {liens === 1 ? 'Retirer aussi le lien qui pointe vers elles' : `Retirer aussi les ${liens} liens qui pointent vers elles`}
                <span className="discret"> (sinon ils restent, signalés comme cassés)</span>
              </label>
            )}
            <div className="boutons">
              <button onClick={() => p.setConfirmer(false)}>Annuler</button>
              <button
                className="danger"
                autoFocus
                onClick={() => {
                  p.setConfirmer(false)
                  void p.supprimer(nettoyer)
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </Flottant>
      )}
    </div>
  )
}


const pluriel = (n: number, mot: string, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`

/** Confirmation d'un collage sur des cellules : ce qui sera remplacé, créé ou ignoré. */
export function FenetreRemplacement(p: {
  remplacement: Remplacement
  /** « Titre de la ligne › Colonne » de la première case remplacée. */
  depart: string
  appliquer: () => void
  enNouvellesLignes: () => void
  fermer: () => void
}) {
  const r = p.remplacement
  const rien = r.modifs.length === 0 && r.nouvelles.length === 0
  return (
    <Fenetre titre="Coller dans le tableau" fermer={p.fermer}>
      <div className="remplacement">
        {rien ? (
          <p>Rien à coller ici : aucune valeur ne va dans une colonne qu’on remplit à la main.</p>
        ) : (
          <>
            {r.modifs.length > 0 && (
              <p>
                <strong>
                  Remplacer {pluriel(r.modifs.length, 'valeur')} dans {pluriel(r.lignes, 'ligne')}
                </strong>
                , à partir de « {p.depart} ». Les valeurs actuelles sont écrasées.
              </p>
            )}
            {r.nouvelles.length > 0 && <p>{pluriel(r.nouvelles.length, 'ligne nouvelle', 'lignes nouvelles')} sous la dernière.</p>}
            {r.options.length > 0 && <p>Options ajoutées : {r.options.map((o) => o.label).join(', ')}.</p>}
          </>
        )}
        {r.ignorees > 0 && (
          <p className="discret">
            {pluriel(r.ignorees, 'valeur ignorée', 'valeurs ignorées')} : colonne calculée, hors du tableau ou texte illisible pour sa colonne.
          </p>
        )}
        {!rien && <p className="discret">Ctrl+Z (⌘Z) pour revenir en arrière.</p>}
        <div className="boutons">
          <button className="discret" onClick={p.fermer}>
            Annuler
          </button>
          <button onClick={p.enNouvellesLignes}>En lignes nouvelles</button>
          {!rien && (
            <button className="principal" autoFocus onClick={p.appliquer}>
              Remplacer
            </button>
          )}
        </div>
      </div>
    </Fenetre>
  )
}
