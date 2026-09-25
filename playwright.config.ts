import { defineConfig } from '@playwright/test'

// Tests de bout en bout de l'interface (Chrome sans fenêtre). Le dossier de
// l'espace est un dossier du stockage privé du navigateur (OPFS) rempli avec
// la démo : voir e2e/espace.ts.
// E2E_URL : viser une autre adresse (le build servi par `vite preview`, en CI).
const cible = process.env.E2E_URL

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'node_modules/.playwright/resultats',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: cible ?? 'http://localhost:5173',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Réutilise le `npm run dev` déjà lancé, sinon en démarre un (sauf si E2E_URL vise autre chose).
  webServer: cible ? undefined : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
