/**
 * Erreurs de Supabase (PostgREST, Auth, réseau) → messages en français prêts à afficher.
 * Les codes viennent du contrat (api.ts) : P0001 = règle du jeu, 28000 = pas connecté,
 * PGRST202 = fonction absente (script SQL pas lancé). Une clé refusée (401 « Invalid API
 * key ») n'est PAS un problème de réseau : le message dit quoi vérifier sur Vercel.
 */
import { typo } from '../../core/fr'
import { CODE_LENGTH } from '../source'
import { PGRST_NO_FUNCTION, SQLSTATE } from './api'

/**
 * Une erreur telle que la renvoient supabase-js et ses briques :
 * - PostgREST : { message, code (SQLSTATE ou PGRSTxxx), details, hint } et le statut HTTP de
 *   la réponse (recopié dans `status`) ; coupure réseau : statut 0, code '' et message
 *   « TypeError: Failed to fetch » (« Load failed » sur Safari, « TimeoutError: … » si trop long) ;
 * - Auth : { message, code ('anonymous_provider_disabled'…), status, name ('AuthRetryableFetchError'…) }.
 */
export interface ErrorLike {
  message?: string
  code?: string | null
  status?: number
  name?: string
}

export type ErrorKind =
  /** Règle du jeu ou saisie refusée (P0001) : le message du serveur est prêt à afficher. */
  | 'rule'
  /** Session pas liée à un joueur (28000), ou pas de session du tout (42501, rôle anon). */
  | 'notMember'
  /** Fonction absente : le script SQL n'a pas été lancé (PGRST202). */
  | 'noFunction'
  /** Clé publishable refusée ou URL qui ne mène pas à l'API (401/403 sans SQLSTATE, PGRST30x). */
  | 'badKey'
  /** Connexion anonyme désactivée dans Supabase. */
  | 'anonDisabled'
  /** Trop de requêtes (limite de Supabase Auth). */
  | 'rateLimit'
  /** Pas de réseau, serveur injoignable. */
  | 'network'
  | 'other'

/** Les messages de la source (typographie française appliquée). */
export const MESSAGES = {
  /** Une action n'est pas passée (réseau, serveur…). Texte imposé par le cahier des charges. */
  network: typo('Oups, le serveur n’a pas répondu 📶 Réessaie'),
  /** Problème bloquant au démarrage : on réessaie tout seuls. */
  offline: typo('Impossible de joindre le serveur 📶 Vérifie ta connexion, on réessaie tout seuls.'),
  /** Connecté, mais la relecture n'est pas passée : les données affichées datent un peu. */
  stale: typo('Pas de réseau 📶 Ce que tu vois n’est peut-être pas à jour, on réessaie tout seuls.'),
  /** Le serveur répond, mais par une erreur qui n'est ni une règle ni le réseau. */
  serverError: typo(
    'Le serveur a répondu une erreur 🛠️ On réessaie tout seuls. Si ça dure, relance le script supabase/migrations/0001_duel.sql dans Supabase › SQL Editor.',
  ),
  /** Mauvaise clé (ou mauvaise URL) dans les variables de Vercel : inutile de réessayer. */
  badKey: typo(
    'Clé Supabase refusée 🔑 Vérifie VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (la clé publishable, sb_publishable_…) dans Vercel › Settings › Environment Variables, puis redéploie.',
  ),
  dbNotReady: typo(
    'La base n’est pas prête 🛠️ Dans Supabase › SQL Editor, lance le script supabase/migrations/0001_duel.sql, puis recharge l’app.',
  ),
  dbOutdated: typo(
    'La base n’est pas à jour 🛠️ Relance le script supabase/migrations/0001_duel.sql dans Supabase › SQL Editor, puis recharge l’app.',
  ),
  notMember: typo('Connecte-toi d’abord 🔑'),
  anonDisabled: typo(
    'Connexion impossible : active « Allow anonymous sign-ins » dans Supabase › Authentication › Sign In / Providers, puis réessaie 🔧',
  ),
  rateLimit: typo('Trop d’essais d’un coup ⏳ Attends quelques minutes avant de réessayer.'),
  codeFormat: typo(`Le code, c’est ${CODE_LENGTH} chiffres 🔢`),
  notYourGage: typo('C’est à l’autre de valider ton gage 😉'),
  unknownHabit: typo('Habitude inconnue 🤔'),
}

/** Le code est-il bien formé ? (même règle que claim_player côté serveur) */
export function isCodeFormatOk(code: string): boolean {
  return new RegExp(`^[0-9]{${CODE_LENGTH}}$`).test(code)
}

/** N'importe quoi (erreur levée, { error } d'une réponse…) → ErrorLike. */
export function toErrorLike(e: unknown): ErrorLike {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    return {
      message: typeof o.message === 'string' ? o.message : String(o.message ?? ''),
      code: typeof o.code === 'string' ? o.code : null,
      status: typeof o.status === 'number' ? o.status : undefined,
      name: typeof o.name === 'string' ? o.name : undefined,
    }
  }
  return { message: typeof e === 'string' ? e : '' }
}

const NETWORK_NAMES = new Set(['AuthRetryableFetchError', 'TypeError', 'FetchError', 'AbortError', 'TimeoutError'])
/** Messages de fetch en panne selon le navigateur (Chrome, Safari, Firefox, Node), ou trop long. */
const NETWORK_MESSAGE = /^(TypeError|FetchError|AbortError|TimeoutError)\b|Failed to fetch|Load failed|NetworkError|fetch failed|network/i
/** Ce que répond Supabase pour une clé inconnue, absente ou secrète (interdite dans un navigateur). */
const BAD_KEY_MESSAGE = /invalid api key|no api key|secret api key|unregistered api key|api key.*(invalid|not found|missing)/i
/** Codes PostgREST de configuration du JWT (clé, secret, accès anonyme). */
const BAD_KEY_CODES = new Set(['PGRST300', 'PGRST301', 'PGRST302'])

export function classifyError(e: unknown): ErrorKind {
  const err = toErrorLike(e)
  const code = err.code ?? ''
  const message = err.message ?? ''
  if (code === SQLSTATE.rule) return 'rule'
  if (code === SQLSTATE.notMember || code === SQLSTATE.noSession) return 'notMember'
  if (code === PGRST_NO_FUNCTION) return 'noFunction'
  if (BAD_KEY_CODES.has(code) || BAD_KEY_MESSAGE.test(message)) return 'badKey'
  // 401 / 403 sans code : la passerelle de Supabase (clé), pas une fonction du duel.
  if (!code && (err.status === 401 || err.status === 403)) return 'badKey'
  if (code === 'anonymous_provider_disabled' || /anonymous sign-?ins are disabled/i.test(message)) return 'anonDisabled'
  if (code === 'over_request_rate_limit' || err.status === 429) return 'rateLimit'
  if (err.status === 0 || (err.name && NETWORK_NAMES.has(err.name)) || NETWORK_MESSAGE.test(message)) return 'network'
  // 5xx sans code : la passerelle n'a pas pu joindre la base (projet en pause, redémarrage).
  if (!code && err.status !== undefined && err.status >= 500) return 'network'
  return 'other'
}

/** Le message à montrer pour une erreur (règle du jeu : le message du serveur tel quel). */
export function toUserMessage(e: unknown): string {
  const err = toErrorLike(e)
  switch (classifyError(err)) {
    case 'rule':
      return err.message?.trim() ? typo(err.message.trim()) : MESSAGES.network
    case 'notMember':
      // 42501 arrive avec le message anglais de Postgres : jamais affiché tel quel.
      return err.code === SQLSTATE.notMember && err.message?.trim() ? typo(err.message.trim()) : MESSAGES.notMember
    case 'noFunction':
      return MESSAGES.dbNotReady
    case 'badKey':
      return MESSAGES.badKey
    case 'anonDisabled':
      return MESSAGES.anonDisabled
    case 'rateLimit':
      return MESSAGES.rateLimit
    default:
      return MESSAGES.network
  }
}
