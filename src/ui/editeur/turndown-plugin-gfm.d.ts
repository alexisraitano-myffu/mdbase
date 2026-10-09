// Le paquet n'a pas de types : ses greffons s'utilisent par `TurndownService.use`.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
}
