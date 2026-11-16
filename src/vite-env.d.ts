/// <reference types="vite/client" />

/**
 * Variables d'environnement lues par l'app (voir .env.example et src/data/env.ts, qui les lit
 * une par une). Sans URL + clé : maquette en local, écran « pas branchée » en production.
 */
interface ImportMetaEnv {
  /** URL du projet Supabase, ex. https://abcdefghijklmnop.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Clé « publishable » (sb_publishable_…) : publique par nature. Jamais la clé secret / service_role. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Autres noms acceptés pour la même clé (ceux du bouton « Connect » de Supabase). */
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_KEY?: string
  /** 1 : maquette forcée, même en production (maquette autonome). */
  readonly VITE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Date du build (ISO) et commit déployé (7 caractères, sur Vercel) : défini dans vite.config.ts. */
declare const __BUILD_INFO__: { readonly date: string; readonly commit: string | null }

/**
 * Variables NEXT_PUBLIC_SUPABASE_… trouvées au build (liste blanche NEXT_PUBLIC_VARS de
 * src/data/envNames.ts, copiée par vite.config.ts). Rien d'autre de l'environnement.
 */
declare const __NEXT_PUBLIC_ENV__: Readonly<Partial<Record<string, string>>>
