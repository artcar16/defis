/**
 * 🔌 Vraie base, maquette, ou « pas branchée » ? Module pur : la décision ne dépend que des
 * variables d'environnement (lues une par une dans env.ts), de l'adresse de la page (?demo)
 * et du type de build.
 *
 * Règle d'or : sur le site déployé, jamais de maquette en silence. Sans réglages utilisables,
 * l'app affiche « pas branchée » avec ce qui manque (des noms de variables, jamais de valeurs).
 * La maquette, c'est seulement : ?demo dans l'adresse, VITE_DEMO=1 au build (maquette
 * autonome), ou le développement en local sans .env.
 */
import { cleanValue, parseProjectUrl, secretKind, urlHint, type SecretKind, type SupabaseConfig, type UrlHint } from './supabase/config'

import { KEY_VARS, URL_VARS } from './envNames'

export { KEY_VARS, URL_VARS }

/** Le nom à donner à l'URL (celui qu'on affiche). Autre nom accepté : NEXT_PUBLIC_SUPABASE_URL. */
export const URL_VAR = URL_VARS[0]

/** Le nom à donner à la clé (celui qu'on affiche). */
export const KEY_VAR = KEY_VARS[0]

/** VITE_DEMO=1 (ou true) au build : la maquette, même en production (maquette autonome). */
export const DEMO_VAR = 'VITE_DEMO'

export type UrlVar = (typeof URL_VARS)[number]
export type KeyVar = (typeof KEY_VARS)[number]
export type SupabaseVar = UrlVar | KeyVar

/** Cette variable est-elle un des noms de l'URL ? */
export function isUrlVar(name: SupabaseVar): name is UrlVar {
  return (URL_VARS as readonly string[]).includes(name)
}

/** Les variables lues, telles que Vite les donne (absentes = undefined). */
export type ModeEnv = { readonly [K in SupabaseVar | typeof DEMO_VAR]?: string | undefined }

/** Ce qui empêche de brancher la base, du plus urgent au moins urgent. */
export type Problem = 'secretKey' | 'missingUrl' | 'invalidUrl' | 'missingKey'

/** Diagnostic sans aucune valeur : seulement des noms de variables et des problèmes. */
export interface Diagnosis {
  /** Variables Supabase trouvées (non vides), dans l'ordre URL puis alias de la clé. */
  found: SupabaseVar[]
  /** Variable d'où vient la clé utilisable (premier alias non vide et pas secret), ou null. */
  keyVar: KeyVar | null
  /** Variables qui contiennent une clé secrète (à retirer et régénérer d'urgence). */
  secrets: { name: SupabaseVar; kind: SecretKind }[]
  /** Le plus urgent d'abord ; vide si la base peut être branchée. */
  problems: Problem[]
  /** Avec invalidUrl seulement : ce qui cloche dans l'adresse (base, tableau de bord, « .com »…). */
  urlHint?: UrlHint
}

/** Pourquoi la maquette : ?demo dans l'adresse, VITE_DEMO au build, ou dev sans .env. */
export type DemoReason = 'asked' | 'flag' | 'dev'

export type AppMode =
  | { kind: 'supabase'; config: SupabaseConfig; keyVar: KeyVar }
  | { kind: 'demo'; reason: DemoReason; diagnosis: Diagnosis }
  | { kind: 'unconfigured'; diagnosis: Diagnosis }

/** Les modes où l'app tourne (avec DuelProvider). */
export type RunMode = Exclude<AppMode, { kind: 'unconfigured' }>

function isOn(value: string | undefined): boolean {
  return /^(1|true|yes|oui)$/i.test(cleanValue(value))
}

/** Le diagnostic, et la config Supabase si elle est utilisable. */
function inspect(env: ModeEnv): { diagnosis: Diagnosis; config: SupabaseConfig | null } {
  const found: SupabaseVar[] = []
  const secrets: Diagnosis['secrets'] = []

  // L'URL : le premier nom rempli. Toutes les variables lues finissent dans l'app : une clé
  // secrète collée par erreur dans l'une d'elles est publiée tout autant, on la signale aussi.
  let rawUrl = ''
  let urlSecret: SecretKind | null = null
  for (const name of URL_VARS) {
    const value = cleanValue(env[name])
    if (!value) continue
    found.push(name)
    const kind = secretKind(value)
    if (kind) secrets.push({ name, kind })
    if (!rawUrl) {
      rawUrl = value
      urlSecret = kind
    }
  }

  let keyVar: KeyVar | null = null
  let key = ''
  for (const name of KEY_VARS) {
    const value = cleanValue(env[name])
    if (!value) continue
    found.push(name)
    // Toutes les variables lues finissent dans l'app : une clé secrète dans n'importe
    // lequel des alias est publiée, même si on ne s'en sert pas.
    const kind = secretKind(value)
    if (kind) secrets.push({ name, kind })
    else if (!keyVar) {
      keyVar = name
      key = value
    }
  }

  const url = rawUrl && !urlSecret ? parseProjectUrl(rawUrl) : null
  const problems: Problem[] = []
  if (secrets.length > 0) problems.push('secretKey')
  if (!rawUrl) problems.push('missingUrl')
  else if (!url) problems.push('invalidUrl')
  if (!keyVar) problems.push('missingKey')
  const hint = rawUrl && !url && !urlSecret ? urlHint(rawUrl) : null

  return {
    diagnosis: { found, keyVar, secrets, problems, ...(hint ? { urlHint: hint } : {}) },
    config: url && keyVar && problems.length === 0 ? { url, key } : null,
  }
}

/**
 * Le mode de l'app.
 * @param env variables lues (URL et clé sous leurs noms acceptés, VITE_DEMO)
 * @param search partie « ?… » de l'adresse de la page
 * @param isProd build de production (site déployé, vite preview) ou pas (npm run dev)
 */
export function appMode(env: ModeEnv, search: string, isProd: boolean): AppMode {
  const { diagnosis, config } = inspect(env)
  // Clé secrète publiée : rien d'autre ne compte, pas même ?demo. Il faut la changer d'urgence.
  if (diagnosis.secrets.length > 0) return { kind: 'unconfigured', diagnosis }
  if (new URLSearchParams(search).has('demo')) return { kind: 'demo', reason: 'asked', diagnosis }
  if (isOn(env[DEMO_VAR])) return { kind: 'demo', reason: 'flag', diagnosis }
  if (config && diagnosis.keyVar) return { kind: 'supabase', config, keyVar: diagnosis.keyVar }
  return isProd ? { kind: 'unconfigured', diagnosis } : { kind: 'demo', reason: 'dev', diagnosis }
}
