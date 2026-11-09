import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ALargeSmall } from 'lucide-react'
import { Choix } from './Choix'
import { Flottant } from './flottant'
import { Icone } from './icones'
import { Interrupteur, Reglage, Section } from './reglages'

// Options d'affichage : largeur des pages, taille et police de leur texte,
// densité des tableaux. Préférences de cette machine (localStorage), jamais
// dans le dossier : elles ne touchent aucun fichier, et restent réglables en
// mode consultation. Posées en attributs sur <html>, lues par app.css.

export type Taille = 'petite' | 'normale' | 'grande'
export type Police = 'sans' | 'serif' | 'mono'
export type Densite = 'normale' | 'compacte'
export type Affichage = { pleineLargeur: boolean; taille: Taille; police: Police; densite: Densite }

export const AFFICHAGE_DEFAUT: Affichage = { pleineLargeur: false, taille: 'normale', police: 'sans', densite: 'normale' }
/** Hauteur d'une ligne du tableau, par densité (le CSS la reprend par `--hauteur-ligne`). */
export const HAUTEURS_LIGNE: Record<Densite, number> = { normale: 34, compacte: 28 }

const CLE = 'mdbase.affichage'
const TAILLES: readonly Taille[] = ['petite', 'normale', 'grande']
const POLICES: readonly Police[] = ['sans', 'serif', 'mono']
const DENSITES: readonly Densite[] = ['normale', 'compacte']
const abonnes = new Set<() => void>()
let courant: Affichage | null = null

const parmi = <T extends string>(liste: readonly T[], v: unknown, defaut: T): T => (liste.includes(v as T) ? (v as T) : defaut)

export function lireAffichage(): Affichage {
  if (courant) return courant
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Record<string, unknown> | null
    courant = {
      pleineLargeur: brut?.pleineLargeur === true,
      taille: parmi(TAILLES, brut?.taille, AFFICHAGE_DEFAUT.taille),
      police: parmi(POLICES, brut?.police, AFFICHAGE_DEFAUT.police),
      densite: parmi(DENSITES, brut?.densite, AFFICHAGE_DEFAUT.densite),
    }
  } catch {
    courant = AFFICHAGE_DEFAUT
  }
  return courant
}

export function changerAffichage(changement: Partial<Affichage>) {
  courant = { ...lireAffichage(), ...changement }
  try {
    localStorage.setItem(CLE, JSON.stringify(courant))
  } catch {
    // stockage indisponible : réglage gardé pour la visite seulement
  }
  for (const f of abonnes) f()
}

const abonner = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

export const useAffichage = (): Affichage => useSyncExternalStore(abonner, lireAffichage)

/** Pose les réglages sur <html> : `data-largeur`, `data-taille`, `data-police`, `data-densite`. */
export function useAppliquerAffichage() {
  const a = useAffichage()
  useEffect(() => {
    const d = document.documentElement.dataset
    d.largeur = a.pleineLargeur ? 'pleine' : 'normale'
    d.taille = a.taille
    d.police = a.police
    d.densite = a.densite
  }, [a])
}

const ENTREES_TAILLE = [
  { valeur: 'petite', libelle: 'Petite' },
  { valeur: 'normale', libelle: 'Normale' },
  { valeur: 'grande', libelle: 'Grande' },
]
const ENTREES_POLICE = [
  { valeur: 'sans', libelle: 'Sans empattement' },
  { valeur: 'serif', libelle: 'Avec empattement' },
  { valeur: 'mono', libelle: 'Chasse fixe' },
]
const ENTREES_DENSITE = [
  { valeur: 'normale', libelle: 'Normale' },
  { valeur: 'compacte', libelle: 'Compacte' },
]

/** Bouton du coin de la zone principale : ouvre les options d'affichage. */
export function BoutonAffichage() {
  const a = useAffichage()
  const bouton = useRef<HTMLButtonElement>(null)
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <button
        ref={bouton}
        className="discret bouton-affichage"
        title="Affichage"
        aria-label="Affichage"
        aria-expanded={ouvert}
        onMouseDown={(e) => ouvert && e.stopPropagation()}
        onClick={() => setOuvert((o) => !o)}
      >
        <Icone de={ALargeSmall} taille={17} />
      </button>
      {ouvert && (
        <Flottant ancre={bouton.current} fermer={() => setOuvert(false)}>
          <div className="panneau-affichage" role="dialog" aria-label="Affichage">
            <Section titre="Pages" aide="Réglages de cette machine : les fichiers ne changent pas.">
              <Interrupteur libelle="Pleine largeur" coche={a.pleineLargeur} changer={(v) => changerAffichage({ pleineLargeur: v })} />
              <Reglage libelle="Taille du texte">
                <Choix libelle="Taille du texte" valeur={a.taille} entrees={ENTREES_TAILLE} changer={(v) => changerAffichage({ taille: v as Taille })} />
              </Reglage>
              <Reglage libelle="Police">
                <Choix libelle="Police" valeur={a.police} entrees={ENTREES_POLICE} changer={(v) => changerAffichage({ police: v as Police })} />
              </Reglage>
            </Section>
            <Section titre="Tableaux">
              <Reglage libelle="Densité">
                <Choix libelle="Densité" valeur={a.densite} entrees={ENTREES_DENSITE} changer={(v) => changerAffichage({ densite: v as Densite })} />
              </Reglage>
            </Section>
          </div>
        </Flottant>
      )}
    </>
  )
}
