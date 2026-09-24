import { useEffect, useState } from 'react'
import { aujourdhui } from '../adapters/navigateur'

/** Date du jour, rafraîchie au retour sur l'onglet (changement de jour, spec §6). */
export function useAujourdhui(): string {
  const [jour, setJour] = useState(aujourdhui)
  useEffect(() => {
    const maj = () => setJour(aujourdhui())
    document.addEventListener('visibilitychange', maj)
    window.addEventListener('focus', maj)
    return () => {
      document.removeEventListener('visibilitychange', maj)
      window.removeEventListener('focus', maj)
    }
  }, [])
  return jour
}
