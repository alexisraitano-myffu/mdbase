import { lazy, Suspense, useRef, useState } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import { useConsultation } from './mode'

// Milkdown pèse lourd : chargé seulement à l'ouverture d'une première page.
const EditeurCorps = lazy(() => import('./EditeurCorps').then((m) => ({ default: m.EditeurCorps })))

/** Corps d'une ligne (spec §9), édité sur place : écrit dans le fichier de cette ligne. */
export function Corps({ depot, ligne }: { depot: DepotBase; ligne: LigneChargee }) {
  // Le chemin peut changer (renommage) : on retrouve toujours la ligne par son id au moment d'écrire.
  const idLigne = ligne.id
  // Corps changé sur le disque (autre machine) : l'éditeur est remonté, sinon
  // il garderait l'ancien texte et le réécrirait à la frappe suivante.
  const emis = useRef(ligne.corps)
  const [suivi, setSuivi] = useState({ corps: ligne.corps, version: 0 })
  const lecture = useConsultation()
  if (ligne.corps !== suivi.corps) setSuivi({ corps: ligne.corps, version: suivi.version + (ligne.corps === emis.current ? 0 : 1) })
  return (
    <div className="corps-page">
      <Suspense fallback={<div className="discret">Chargement de l'éditeur…</div>}>
        <EditeurCorps
          key={`${idLigne}:${suivi.version}`}
          initial={ligne.corps}
          lecture={lecture}
          changer={(md) => {
            emis.current = md
            const actuelle = depot.lignes().find((l) => l.id === idLigne)
            if (actuelle) depot.modifierCorps(actuelle.chemin, md)
          }}
        />
      </Suspense>
    </div>
  )
}
