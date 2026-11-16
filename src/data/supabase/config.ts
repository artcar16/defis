/**
 * Petits outils purs sur les réglages Supabase (URL du projet, clé). La décision « vraie base,
 * maquette ou pas branchée » est prise dans ../mode.ts.
 * On ne renvoie, n'affiche ni ne journalise jamais la valeur d'une clé.
 */

export interface SupabaseConfig {
  url: string
  key: string
}

/**
 * Secrets à ne JAMAIS mettre dans l'app (tout ce qui est lu finit dans le JS public) : la
 * nouvelle clé secrète, l'ancienne service_role (JWT), ou le mot de passe de la base (chaîne
 * de connexion postgresql://…). Tous donnent tous les droits sur la base.
 */
export type SecretKind = 'sb_secret' | 'service_role' | 'db_password'

/**
 * Pourquoi l'URL reçue n'est pas le Project URL : celle de la base de données (postgresql://…,
 * db.xxxx.supabase.co, pooler), celle du tableau de bord, un « .com » au lieu de « .co », ou
 * autre chose.
 */
export type UrlHint = 'database' | 'dashboard' | 'dotCom' | 'other'

/** Hôtes du site de Supabase (tableau de bord), pas d'un projet : une adresse recopiée du navigateur. */
const DASHBOARD_HOSTS = new Set(['supabase.com', 'www.supabase.com', 'app.supabase.com', 'supabase.co', 'www.supabase.co'])

/** « xxxx.supabase.co » recopié sans https:// devant (avec ou sans chemin). */
const BARE_PROJECT_HOST = /^[a-z0-9-]+\.supabase\.co(?:[/:?#]|$)/i

/** Chaîne de connexion à la base (onglet « Connection String » du bouton Connect), pas une adresse web. */
const DB_SCHEME = /^(?:jdbc:)?postgres(?:ql)?:/i

/**
 * Valeur d'une variable, nettoyée : espaces autour, et guillemets recopiés avec
 * (« "https://…" » dans Vercel). Vide si absente.
 */
export function cleanValue(value: string | undefined | null): string {
  const v = (value ?? '').trim()
  const quoted = /^(["'])(.*)\1$/s.exec(v)
  return (quoted ? quoted[2] : v).trim()
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

/** L'adresse lue comme une URL (https:// ajouté devant « xxxx.supabase.co »), ou null. */
function readUrl(raw: string): URL | null {
  let value = cleanValue(raw)
  if (!value) return null
  if (BARE_PROJECT_HOST.test(value)) value = `https://${value}`
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Ce qui cloche dans une adresse qui n'est pas le Project URL (null si elle l'est). */
export function urlHint(raw: string): UrlHint | null {
  if (parseProjectUrl(raw) !== null) return null
  const value = cleanValue(raw)
  if (DB_SCHEME.test(value)) return 'database'
  // Pour comprendre la faute, une adresse sans « https:// » devant est lue comme si elle l'avait.
  const host = (readUrl(value.includes('://') ? value : `https://${value}`)?.hostname ?? '').toLowerCase()
  if (DASHBOARD_HOSTS.has(host)) return 'dashboard'
  if (/^db\.[a-z0-9-]+\.supabase\.co$/.test(host) || host.endsWith('.pooler.supabase.com')) return 'database'
  if (host.endsWith('.supabase.com')) return 'dotCom'
  return 'other'
}

/**
 * L'URL du projet prête pour supabase-js, ou null si ce n'en est pas une : pas une adresse
 * http(s), celle du tableau de bord de Supabase (supabase.com/dashboard/…), celle de la base
 * (db.xxxx.supabase.co, pooler) ou une faute « .supabase.com », au lieu du Project URL
 * (https://xxxx.supabase.co). « xxxx.supabase.co » sans https:// devant est accepté (on
 * l'ajoute), et http:// y devient https:// (sinon le navigateur bloque l'appel).
 */
export function parseProjectUrl(raw: string): string | null {
  const u = readUrl(raw)
  if (!u) return null
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  if (!host || DASHBOARD_HOSTS.has(host)) return null
  // Un identifiant ou un mot de passe dans l'adresse : jamais dans un Project URL.
  if (u.username || u.password) return null
  // Le site de Supabase, ou le pooler de la base : jamais l'adresse d'un projet.
  if (host.endsWith('.supabase.com')) return null
  if (host.endsWith('.supabase.co')) {
    // Un projet, c'est UN nom devant : xxxx.supabase.co (pas db.xxxx.supabase.co, la base).
    if (host.split('.').length !== 3) return null
    u.protocol = 'https:'
  }
  return projectUrl(u.href)
}

/** « abcdefgh.supabase.co » : l'hôte du projet (public : il est dans l'URL). Jamais la clé. */
export function projectHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Le rôle (« anon », « service_role »…) d'une clé au format JWT (ancienne clé Supabase), ou null. */
function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
    const role = (payload as { role?: unknown } | null)?.role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

/** Mot de passe d'exemple des chaînes de connexion de Supabase (« [YOUR-PASSWORD] ») : pas un secret. */
const PASSWORD_PLACEHOLDER = /^\[?your[-_]?password\]?$/i

/**
 * Le mot de passe d'une chaîne de connexion à la base, ou null : postgresql://user:MOT@hôte…
 * (jusqu'au DERNIER « @ » : le mot de passe peut en contenir), https://user:MOT@…, ou
 * « password=MOT » (JDBC, .NET). Le mot de passe d'exemple ne compte pas.
 */
function dbPassword(v: string): string | null {
  let pw: string | null = null
  const uri = /^(?:jdbc:)?postgres(?:ql)?:\/\/[^:@/]*:(.+)@[^@]*$/i.exec(v)
  if (uri) pw = uri[1]
  if (!pw && /^https?:\/\//i.test(v)) {
    try {
      pw = new URL(v).password || null
    } catch {
      pw = null
    }
  }
  if (!pw) pw = /(?:^|[?&;])password=([^&;]+)/i.exec(v)?.[1] ?? null
  return pw && !PASSWORD_PLACEHOLDER.test(pw) ? pw : null
}

/**
 * Cette valeur contient-elle un secret (tous les droits sur la base) ? `sb_secret_…`, un JWT
 * dont le rôle est service_role, ou le mot de passe de la base. null si ce n'en est pas un
 * (clé publishable ou anon, adresse du projet).
 *
 * On cherche PARTOUT dans la valeur, blancs enlevés : une clé entourée de guillemets courbes
 * ou de « », précédée de « Bearer », d'un caractère invisible, coupée par un retour à la
 * ligne, ou suivie d'un point est publiée tout autant.
 */
export function secretKind(value: string): SecretKind | null {
  const v = cleanValue(value).replace(/[\s\u200B-\u200D\u2060]+/g, '')
  if (/sb_secret_/i.test(v)) return 'sb_secret'
  for (const jwt of v.match(/eyJ[\w-]*\.eyJ[\w-]*\.[\w-]*/g) ?? []) {
    const role = jwtRole(jwt)
    if (role === 'service_role' || role === 'supabase_admin') return 'service_role'
  }
  return dbPassword(v) ? 'db_password' : null
}
