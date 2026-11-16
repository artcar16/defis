/// <reference types="vite/client" />

/** Variables d'environnement lues par l'app (voir .env.example). Absentes → maquette. */
interface ImportMetaEnv {
  /** URL du projet Supabase, ex. https://abcdefghijklmnop.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Clé « publishable » (sb_publishable_…) : publique par nature. Jamais la clé secret / service_role. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Les variables Supabase publiques trouvées au moment du build (liste blanche
 * SUPABASE_ENV_NAMES, injectée par vite.config.ts). Rien d'autre de l'environnement.
 */
declare const __SUPABASE_ENV__: import('./data/supabase/config').SupabaseEnv
