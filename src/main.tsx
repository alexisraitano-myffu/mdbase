import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA : installable depuis Chrome ou Edge, s'ouvre hors ligne (pwa/sw.js). Pas en dev.
// L'app de bureau embarque déjà ses fichiers : pas de service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !('__TAURI_INTERNALS__' in window)) {
  window.addEventListener('load', () => {
    // Sans service worker, l'app marche quand même (en ligne) : un échec n'est qu'un avertissement.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.warn('Service worker non enregistré', e))
  })
}
