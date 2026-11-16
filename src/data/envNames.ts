/**
 * Noms des variables Supabase que l'app accepte (module sans import : vite.config.ts le lit aussi).
 *
 * Deux familles : celles de Vite (VITE_…) et celles que Supabase (bouton « Connect », réglé sur
 * Next.js) ou l'intégration Supabase de Vercel créent (NEXT_PUBLIC_…). Les NEXT_PUBLIC_… ne sont
 * pas lisibles par Vite d'office : vite.config.ts copie dans l'app CES NOMS-LÀ uniquement, un par
 * un (jamais SUPABASE_SERVICE_ROLE_KEY, POSTGRES_… ni rien d'autre de l'environnement).
 */

/** Noms acceptés pour l'URL du projet, du préféré au moins préféré. */
export const URL_VARS = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const

/**
 * Noms acceptés pour la clé publique, du préféré au moins préféré : le nom officiel du README,
 * puis ceux que proposent Supabase et Vercel.
 */
export const KEY_VARS = [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

/** Les noms NEXT_PUBLIC_… de ces deux listes : ceux que vite.config.ts doit copier lui-même. */
export const NEXT_PUBLIC_VARS = [...URL_VARS, ...KEY_VARS].filter((name) => name.startsWith('NEXT_PUBLIC_'))
