/**
 * Faut-il brancher la vraie base ? Oui si les deux variables Vite sont là (fichier .env en
 * local, Environment Variables sur Vercel) et que l'URL de la page n'a pas ?demo.
 * Sinon : la maquette (DemoSource).
 */

export interface SupabaseConfig {
  url: string
  key: string
}

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

/** La config Supabase à utiliser, ou null pour la maquette. */
export function supabaseConfig(env: SupabaseEnv, search: string): SupabaseConfig | null {
  if (new URLSearchParams(search).has('demo')) return null
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  if (!url || !key) return null
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
