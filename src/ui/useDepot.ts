import { useSyncExternalStore } from 'react'
import type { DepotBase } from '../core/depot-base'

export function useLignes(depot: DepotBase) {
  return useSyncExternalStore(depot.abonner, depot.lignes)
}

export function useErreurDepot(depot: DepotBase) {
  return useSyncExternalStore(depot.abonner, depot.erreur)
}
