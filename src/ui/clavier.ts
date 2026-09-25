/**
 * Champ où le clavier appartient à la saisie (Ctrl+Z, Suppr, copier, coller y
 * gardent leur sens natif). Une case à cocher n'en est pas un.
 */
export function estChampDeSaisie(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t.tagName) || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(t.type)))
  )
}
