/**
 * Faut-il brancher la vraie base ? Oui si l'URL et la clé publique sont là (fichier .env en
 * local, Environment Variables sur Vercel) et que l'URL de la page n'a pas ?demo.
 * Sinon : la maquette (DemoSource).
 *
 * Noms acceptés : ceux de Vite (VITE_…) et ceux que Supabase / l'intégration Vercel créent
 * pour Next.js (NEXT_PUBLIC_…). Seuls ces noms PUBLICS sont lus, un par un (vite.config.ts,
 * SUPABASE_ENV_NAMES) : aucune autre variable d'env n'entre dans l'app.
 */

export interface SupabaseConfig {
  url: string
  key: string
}

/** Noms acceptés pour l'URL du projet, par ordre de préférence. */
export const SUPABASE_URL_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const

/** Noms acceptés pour la clé publique (publishable ou ancienne anon), par ordre de préférence. */
export const SUPABASE_KEY_NAMES = [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

/** Toutes les variables publiques que l'app a le droit de lire (liste blanche du build). */
export const SUPABASE_ENV_NAMES = [...SUPABASE_URL_NAMES, ...SUPABASE_KEY_NAMES] as const

export type SupabaseEnv = Partial<Record<(typeof SUPABASE_ENV_NAMES)[number], string>>

function firstSet(env: SupabaseEnv, names: readonly (keyof SupabaseEnv)[]): string {
  for (const name of names) {
    const v = env[name]?.trim()
    if (v) return v
  }
  return ''
}

/**
 * La clé secrète (sb_secret_… ou JWT service_role) donne tous les droits sur la base : si
 * elle a été mise par erreur dans une variable publique, on refuse de s'en servir.
 */
export function isSecretKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { role?: unknown }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

/** La config Supabase à utiliser, ou null pour la maquette. */
export function supabaseConfig(env: SupabaseEnv, search: string): SupabaseConfig | null {
  if (new URLSearchParams(search).has('demo')) return null
  const url = firstSet(env, SUPABASE_URL_NAMES)
  const key = firstSet(env, SUPABASE_KEY_NAMES)
  if (!url || !key) return null
  if (isSecretKey(key)) {
    // Jamais la valeur dans la console : seulement le problème.
    console.error(
      'La clé Supabase fournie est la clé SECRÈTE : refusée. Mets la clé publishable (sb_publishable_…) ' +
        'sur Vercel, et régénère la clé secrète dans Supabase › Project Settings › API Keys.',
    )
    return null
  }
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(u.protocol)
  } catch {
    // createClient planterait : on reste en maquette, avec un indice dans la console.
    console.warn('VITE_SUPABASE_URL ne ressemble pas à une URL (https://xxxx.supabase.co) : on reste en maquette.')
    return null
  }
  return { url: projectUrl(url), key }
}

/**
 * L'URL du projet, sans « / » final ni chemin d'API recopié par erreur (supabase-js ajoute
 * lui-même /rest/v1, /auth/v1… : https://xxxx.supabase.co/rest/v1 donnerait /rest/v1/rest/v1).
 */
export function projectUrl(url: string): string {
  const base = url.replace(/\/+$/, '')
  const clean = base.replace(/\/(rest|auth|realtime|storage|functions)\/v1$/i, '')
  if (clean !== base) {
    console.warn(`VITE_SUPABASE_URL : on enlève « ${base.slice(clean.length)} » (il faut juste https://xxxx.supabase.co).`)
  }
  return clean.replace(/\/+$/, '')
}
