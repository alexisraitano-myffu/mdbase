import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Sous-dossier de publication (GitHub Pages sert l'app sous /<dépôt>/).
  base: process.env.BASE ?? '/',
  // Le hook graphify réécrit graphify-out/ après chaque commit : sans ça, la page se recharge.
  server: { watch: { ignored: ['**/graphify-out/**'] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
