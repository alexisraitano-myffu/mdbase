import type { Planifier } from '../core/depot-base'
import type { Aleatoire } from '../core/identifiants'

// Services du navigateur injectés dans le cœur, qui n'y a pas accès lui-même.

export const aleatoire: Aleatoire = (n) => crypto.getRandomValues(new Uint8Array(n))

export const planifier: Planifier = (action, ms) => {
  const t = setTimeout(action, ms)
  return () => clearTimeout(t)
}
