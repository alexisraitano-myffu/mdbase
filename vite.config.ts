import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Le hook graphify réécrit graphify-out/ après chaque commit : sans ça, la page se recharge.
  server: { watch: { ignored: ['**/graphify-out/**'] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
