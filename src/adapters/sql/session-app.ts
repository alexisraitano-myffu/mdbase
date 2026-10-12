import { SessionSql } from '../../core/bi/calcul'

// Le moteur SQL de l'app (spec §10 « Analyse ») : un seul, partagé par les
// dashboards, l'assistant et le MCP servi par l'app de bureau. Chargé au
// premier calcul seulement.

export const sessionSql = new SessionSql(() => import('./duckdb-navigateur').then((m) => m.moteurNavigateur()))
