import { defineConfig } from 'vite'

// Script de synchro Jira (§16) en un seul fichier, Node seul requis : publié
// avec le site (dist/mdbase-jira.mjs) pour se télécharger sans rien installer.
export default defineConfig({
  build: {
    ssr: 'src/outils/jira/main.ts',
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node20',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'mdbase-jira.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
})
