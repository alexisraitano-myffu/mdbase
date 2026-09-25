import { defineConfig } from 'vitest/config'

// Banc de l'assistant IA (banc/) : appels réseau réels, lancé à la main, jamais par `npm test`.
export default defineConfig({
  test: { environment: 'node', include: ['banc/**/*.banc.ts'], disableConsoleIntercept: true },
})
