import { copyFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import paquet from './package.json' with { type: 'json' }

// Serveur MCP (src/outils/mcp) en un seul fichier, avec le manifeste du paquet
// .mcpb : `npm run mcp` assemble dist/mdbase.mcpb, installable d'un clic dans
// Claude Desktop (Mac, Windows), qui fournit lui-même Node.
const SORTIE = 'dist-mcp'

const manifeste = {
  manifest_version: '0.3',
  name: 'mdbase',
  display_name: 'mdbase',
  version: paquet.version,
  description: 'Lit et modifie tes bases mdbase : un dossier de fichiers Markdown + YAML.',
  long_description:
    "Donne à Claude les outils de l'assistant de mdbase sur ton espace : décrire les bases, chercher des lignes ou un mot, lire une page, créer et modifier des lignes, des colonnes, des vues, des dashboards. Chaque valeur passe les mêmes contrôles qu'une saisie dans l'app, et une base synchronisée depuis Jira reste en lecture seule. Rien ne quitte ta machine en dehors de ce que Claude lit pour te répondre.",
  author: { name: 'Alexis Raitano', url: 'https://github.com/alexisraitano-myffu' },
  homepage: paquet.homepage,
  repository: { type: 'git', url: paquet.repository.url },
  license: paquet.license,
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/mdbase-mcp.mjs',
    mcp_config: { command: 'node', args: ['${__dirname}/server/mdbase-mcp.mjs', '${user_config.espace}'] },
  },
  tools_generated: true,
  user_config: {
    espace: {
      type: 'directory',
      title: 'Dossier de l’espace',
      description: 'Le dossier ouvert dans mdbase (celui qui contient tes bases).',
      required: true,
    },
  },
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=20.0.0' } },
}

export default defineConfig({
  publicDir: false,
  define: { __VERSION__: JSON.stringify(paquet.version) },
  build: {
    ssr: 'src/outils/mcp/main.ts',
    outDir: `${SORTIE}/server`,
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'mdbase-mcp.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
  plugins: [
    {
      name: 'manifeste-mcpb',
      closeBundle() {
        writeFileSync(`${SORTIE}/manifest.json`, `${JSON.stringify(manifeste, null, 2)}\n`)
        copyFileSync('public/icone-512.png', `${SORTIE}/icon.png`)
      },
    },
  ],
})
