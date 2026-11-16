/**
 * Lecture des variables d'environnement et de l'adresse de la page, pour mode.ts.
 *
 * ⚠️ Chaque variable est lue par son nom complet (import.meta.env.VITE_…) : Vite remplace
 * chacune par sa valeur au build, et seulement celles-ci finissent dans l'app. Ne jamais
 * passer import.meta.env en entier (Vite l'inlinerait avec toutes les variables VITE_*).
 * Ne jamais changer envPrefix non plus (SUPABASE_ ou NEXT_PUBLIC_ exposeraient les clés
 * serveur que crée l'intégration Supabase de Vercel) : les noms NEXT_PUBLIC_SUPABASE_… acceptés
 * passent par __NEXT_PUBLIC_ENV__, que vite.config.ts remplit avec ces noms-là seulement.
 */
import { appMode, type AppMode, type ModeEnv } from './mode'

export function readEnv(): ModeEnv {
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_KEY: import.meta.env.VITE_SUPABASE_KEY,
    VITE_DEMO: import.meta.env.VITE_DEMO,
    // Noms Next.js (créés par Supabase / Vercel) : Vite ne les lit pas ; vite.config.ts copie
    // ces noms-là uniquement dans __NEXT_PUBLIC_ENV__.
    NEXT_PUBLIC_SUPABASE_URL: __NEXT_PUBLIC_ENV__.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: __NEXT_PUBLIC_ENV__.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: __NEXT_PUBLIC_ENV__.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: __NEXT_PUBLIC_ENV__.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

function currentSearch(): string {
  try {
    return typeof location === 'undefined' ? '' : location.search
  } catch {
    return ''
  }
}

/** Le mode de l'app, d'après le build et l'adresse de la page (lu une fois au démarrage). */
export function currentMode(): AppMode {
  return appMode(readEnv(), currentSearch(), import.meta.env.PROD)
}
