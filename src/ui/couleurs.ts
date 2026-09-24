// Couleurs des options de select (noms stockés dans `_schema.yaml`).
const PALETTE: Record<string, { fond: string; texte: string }> = {
  gris: { fond: '#e9e9e7', texte: '#37352f' },
  marron: { fond: '#eee0da', texte: '#5c3b23' },
  orange: { fond: '#fadec9', texte: '#6f3a0f' },
  jaune: { fond: '#fbeec8', texte: '#5f4a0f' },
  vert: { fond: '#dbeddb', texte: '#1c3829' },
  bleu: { fond: '#d3e5ef', texte: '#183347' },
  violet: { fond: '#e8deee', texte: '#412454' },
  rose: { fond: '#f5e0e9', texte: '#4c2337' },
  rouge: { fond: '#ffe2dd', texte: '#5d1715' },
}

export function couleurOption(couleur: string | undefined) {
  return PALETTE[couleur ?? 'gris'] ?? PALETTE.gris!
}
