import type { ReactNode } from 'react'
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { Icone } from './icones'

// Briques des panneaux de réglages (Options, Filtrer, page…) : mêmes sections,
// mêmes lignes, mêmes interrupteurs partout.

/** Section d'un panneau : titre, aide facultative, séparée de la précédente par un trait fin. */
export function Section(p: { titre?: string; aide?: string; children: ReactNode }) {
  return (
    <section className="section-reglages">
      {p.titre && <div className="titre-section">{p.titre}</div>}
      {p.aide && <div className="discret aide-reglage">{p.aide}</div>}
      {p.children}
    </section>
  )
}

/** Ligne de réglage : le libellé à gauche, le contrôle (souvent un `Choix`) à droite. */
export function Reglage(p: { libelle: string; children: ReactNode }) {
  return (
    <div className="case-reglage ligne-reglage">
      <span className="nom-reglage">{p.libelle}</span>
      {p.children}
    </div>
  )
}

/** Réglage oui / non, en interrupteur (une case à cocher, pour le clavier et les lecteurs d'écran). */
export function Interrupteur(p: { libelle: ReactNode; icone?: LucideIcon; coche: boolean; changer: (v: boolean) => void; desactive?: boolean }) {
  return (
    <label className={`case-reglage ligne-reglage ${p.desactive ? 'desactive' : ''}`}>
      <span className="nom-reglage">
        {p.icone && <Icone de={p.icone} />}
        {p.libelle}
      </span>
      <input type="checkbox" role="switch" className="interrupteur" checked={p.coche} disabled={p.desactive} onChange={(e) => p.changer(e.target.checked)} />
    </label>
  )
}

/** Une colonne affichée ou masquée : son icône, son nom, et un œil à droite. */
export function Visibilite(p: { libelle: string; icone: LucideIcon; visible: boolean; changer: (v: boolean) => void; desactive?: boolean }) {
  const action = `${p.visible ? 'Masquer' : 'Afficher'} ${p.libelle}`
  return (
    <label className={`case-reglage ligne-reglage visibilite ${p.visible ? '' : 'masquee'} ${p.desactive ? 'desactive' : ''}`} title={p.desactive ? undefined : action}>
      <span className="nom-reglage">
        <Icone de={p.icone} />
        {p.libelle}
      </span>
      <span className="oeil">
        <input type="checkbox" checked={p.visible} disabled={p.desactive} aria-label={action} onChange={(e) => p.changer(e.target.checked)} />
        <Icone de={p.visible ? Eye : EyeOff} />
      </span>
    </label>
  )
}
