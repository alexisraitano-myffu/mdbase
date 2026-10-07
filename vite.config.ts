import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/**
 * Service worker de la PWA : `pwa/sw.js` publié en `sw.js`, avec la version du
 * build et la liste des JS et CSS à garder pour ouvrir l'app hors ligne. Les
 * polices (KaTeX) se gardent au premier usage. Au build seulement.
 */
function pwa(): Plugin {
  return {
    name: 'pwa',
    apply: 'build',
    generateBundle(_, bundle) {
      const fichiers = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f)).sort()
      const version = Date.now().toString(36)
      const source = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
        .replace('__VERSION__', JSON.stringify(version))
        .replace('__FICHIERS__', JSON.stringify(fichiers))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), pwa()],
  // Sous-dossier de publication (GitHub Pages sert l'app sous /<dépôt>/).
  base: process.env.BASE ?? '/',
  // Le hook graphify réécrit graphify-out/ après chaque commit : sans ça, la page se recharge.
  server: { watch: { ignored: ['**/graphify-out/**', '**/src-tauri/**'] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
