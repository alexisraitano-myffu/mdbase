// Service worker de mdbase (PWA, spec §12) : l'app s'ouvre hors ligne.
// Les deux constantes du haut sont remplies au build (plugin `pwa` de vite.config.ts).
//
// - Page : le réseau d'abord (une nouvelle version se voit au prochain
//   chargement), la copie en cache si le réseau manque.
// - Fichiers du build (noms hachés, donc immuables) : le cache d'abord.
// - Rien d'autre n'est intercepté : requêtes vers d'autres origines (IA),
//   écritures. Les fichiers de l'espace ne passent jamais par ici.
//
// Pas de skipWaiting : une nouvelle version prend la main quand toutes les
// fenêtres de l'ancienne sont fermées, et une fenêtre ouverte garde les
// fichiers de sa version (chargés à la demande) jusqu'au bout.

// ignoreVary partout : les serveurs répondent `Vary: Origin`, et un script
// `crossorigin` envoie un Origin que la requête du pré-cache n'avait pas.
const CACHE = `mdbase-${__VERSION__}`
const FICHIERS = __FICHIERS__

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FICHIERS])))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k.startsWith('mdbase-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: CACHE, ignoreVary: true })))
    return
  }
  e.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreVary: true }).then(
      (trouve) =>
        trouve ??
        fetch(req).then((r) => {
          // Polices, icônes : gardées au premier usage, dans le cache de cette version.
          if (r.ok) {
            const copie = r.clone()
            void caches.open(CACHE).then((c) => c.put(req, copie))
          }
          return r
        }),
    ),
  )
})
