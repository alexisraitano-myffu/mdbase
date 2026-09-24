import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// Les actions de l'interface sont asynchrones et peuvent être refusées par le
// cœur (colonne titre non supprimable, groupe en double…) : un seul endroit
// pour afficher ces refus.

type Lancer = <T>(action: Promise<T>) => Promise<T | undefined>

const Contexte = createContext<Lancer>(async (a) => a)

export function FournisseurActions({ children }: { children: ReactNode }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const lancer = useCallback<Lancer>(async (action) => {
    try {
      return await action
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      return undefined
    }
  }, [])
  return (
    <Contexte.Provider value={lancer}>
      {children}
      {erreur && (
        <div className="bandeau-erreur" role="alert" onClick={() => setErreur(null)}>
          {erreur} <span className="discret">(clic pour fermer)</span>
        </div>
      )}
    </Contexte.Provider>
  )
}

export const useLancer = () => useContext(Contexte)
