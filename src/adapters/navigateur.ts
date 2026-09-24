import type { Planifier } from '../core/depot-base'
import type { Aleatoire } from '../core/identifiants'

// Services du navigateur injectés dans le cœur, qui n'y a pas accès lui-même.

export const aleatoire: Aleatoire = (n) => crypto.getRandomValues(new Uint8Array(n))

export const planifier: Planifier = (action, ms) => {
  const t = setTimeout(action, ms)
  return () => clearTimeout(t)
}

/** Date locale du jour, `AAAA-MM-JJ` (les dates sont en heure locale, spec §3). */
export function aujourdhui(): string {
  const d = new Date()
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}

/** Date et heure locales, `AAAA-MM-JJTHH:mm` (fonction `maintenant()` des formules). */
export function maintenant(): string {
  const d = new Date()
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${aujourdhui()}T${deux(d.getHours())}:${deux(d.getMinutes())}`
}
