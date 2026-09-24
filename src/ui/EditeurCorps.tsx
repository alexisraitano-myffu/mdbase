import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { useEffect, useRef } from 'react'

/**
 * Corps d'une page (spec §9) : éditeur Milkdown qui produit du Markdown.
 * Monté une fois par ligne (clé du parent) : `initial` n'est lu qu'au montage.
 *
 * Milkdown normalise le Markdown qu'il réécrit (puces, espacements). Pour ne
 * jamais réécrire un fichier qu'on s'est contenté d'ouvrir, les changements ne
 * remontent qu'après une action de l'utilisateur dans l'éditeur.
 */
export function EditeurCorps({ initial, changer }: { initial: string; changer: (markdown: string) => void }) {
  const racine = useRef<HTMLDivElement>(null)
  const changerCourant = useRef(changer)
  changerCourant.current = changer

  useEffect(() => {
    const el = racine.current!
    let touche = false
    const marquer = () => {
      touche = true
    }
    el.addEventListener('keydown', marquer)
    el.addEventListener('pointerdown', marquer)
    el.addEventListener('paste', marquer)
    el.addEventListener('drop', marquer)

    const crepe = new Crepe({
      root: el,
      defaultValue: initial,
      features: {
        // Local et sans images en V1 (spec §9, §12) : ni IA, ni images, ni LaTeX.
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.CodeMirror]: false,
      },
      featureConfigs: { [Crepe.Feature.Placeholder]: { text: 'Écris ici, ou tape « / » pour insérer un bloc', mode: 'doc' } },
    })
    crepe.on((l) =>
      l.markdownUpdated((_ctx, markdown, precedent) => {
        if (touche && markdown !== precedent) changerCourant.current(markdown)
      }),
    )
    const pret = crepe.create()
    return () => {
      el.removeEventListener('keydown', marquer)
      el.removeEventListener('pointerdown', marquer)
      el.removeEventListener('paste', marquer)
      el.removeEventListener('drop', marquer)
      void pret.then(() => crepe.destroy())
    }
    // `initial` volontairement lu une seule fois : le parent remonte l'éditeur à chaque changement de ligne.
  }, [])

  return <div className="editeur-corps" ref={racine} />
}
