import { describe, expect, it, vi } from 'vitest'
import { isSecretKey, projectUrl, supabaseConfig } from './config'
import { classifyError, isCodeFormatOk, MESSAGES, toUserMessage } from './errors'

describe('erreurs Supabase → français', () => {
  it('classe les erreurs du contrat (api.ts)', () => {
    expect(classifyError({ message: 'Code incorrect 🙅', code: 'P0001' })).toBe('rule')
    expect(classifyError({ message: 'Connecte-toi d’abord 🔑', code: '28000' })).toBe('notMember')
    // Sans session (rôle anon), PostgREST refuse d'exécuter la fonction.
    expect(classifyError({ message: 'permission denied for function get_snapshot', code: '42501' })).toBe('notMember')
    expect(classifyError({ message: 'Could not find the function', code: 'PGRST202' })).toBe('noFunction')
  })

  it('reconnaît les coupures réseau (PostgREST, Auth, navigateurs)', () => {
    expect(classifyError({ message: 'TypeError: Failed to fetch', code: '' })).toBe('network')
    expect(classifyError({ message: 'TypeError: Load failed', code: '' })).toBe('network')
    expect(classifyError({ message: 'Failed to fetch', name: 'AuthRetryableFetchError', status: 0 })).toBe('network')
    expect(classifyError(new TypeError('fetch failed'))).toBe('network')
    // Requête coupée par notre délai maximal (fetch avec AbortSignal) : statut 0, « TimeoutError: … ».
    expect(classifyError({ message: 'TimeoutError: The operation timed out.', code: '', status: 0 })).toBe('network')
    expect(classifyError({ message: 'TimeoutError: signal timed out', code: '' })).toBe('network')
    // 502 / 503 de la passerelle (projet en pause, PostgREST qui redémarre) : comme une coupure.
    expect(classifyError({ message: 'upstream connect error', status: 503 })).toBe('network')
    expect(classifyError({ message: 'Bad Gateway', code: '', status: 502 })).toBe('network')
    // … mais une vraie erreur SQL en 500 reste une erreur du serveur.
    expect(classifyError({ message: 'division by zero', code: '22012', status: 500 })).toBe('other')
  })

  it('clé refusée ou mauvaise URL : ni le réseau, ni la base (C3)', () => {
    // Ce que répond la passerelle de Supabase pour une mauvaise clé : 401, sans code.
    expect(classifyError({ message: 'Invalid API key', code: null, status: 401 })).toBe('badKey')
    expect(classifyError({ message: 'Invalid API key' })).toBe('badKey')
    expect(classifyError({ message: 'Forbidden use of secret API key in browser', status: 401 })).toBe('badKey')
    expect(classifyError({ message: 'No API key found in request', status: 401 })).toBe('badKey')
    expect(classifyError({ message: 'JWSError JWSInvalidSignature', code: 'PGRST301', status: 401 })).toBe('badKey')
    expect(classifyError({ message: '', code: '', status: 403 })).toBe('badKey')
    // 42501 arrive aussi en 401 (pas de session) : c'est « pas connecté », pas la clé.
    expect(classifyError({ message: 'permission denied for function get_snapshot', code: '42501', status: 401 })).toBe('notMember')
    // Une erreur SQL n'est pas un problème de réseau.
    expect(classifyError({ message: 'relation "duel.players" does not exist', code: '42P01', status: 404 })).toBe('other')
    expect(toUserMessage({ message: 'Invalid API key', status: 401 })).toBe(MESSAGES.badKey)
    expect(MESSAGES.badKey).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(MESSAGES.badKey).toContain('redéploie')
  })

  it('reconnaît la connexion anonyme désactivée et la limite de requêtes', () => {
    expect(classifyError({ message: 'Anonymous sign-ins are disabled', code: 'anonymous_provider_disabled', status: 422 })).toBe('anonDisabled')
    expect(classifyError({ message: 'Anonymous sign-ins are disabled', status: 422 })).toBe('anonDisabled')
    expect(classifyError({ message: 'Request rate limit reached', code: 'over_request_rate_limit', status: 429 })).toBe('rateLimit')
  })

  it('messages : celui du serveur pour une règle, sinon un message clair', () => {
    expect(toUserMessage({ message: 'Ce jour n’est plus modifiable 🔒', code: 'P0001' })).toBe('Ce jour n’est plus modifiable 🔒')
    expect(toUserMessage({ message: 'boom', code: 'XX000' })).toBe('Oups, le serveur n’a pas répondu 📶 Réessaie')
    expect(toUserMessage({ message: 'permission denied for function set_checkin', code: '42501' })).toBe(MESSAGES.notMember)
    expect(toUserMessage({ message: 'TypeError: Failed to fetch', code: '' })).toBe(MESSAGES.network)
    expect(toUserMessage({ code: 'PGRST202' })).toContain('supabase/migrations/0001_duel.sql')
    expect(toUserMessage({ code: 'anonymous_provider_disabled' })).toContain('Allow anonymous sign-ins')
    expect(toUserMessage('n’importe quoi')).toBe(MESSAGES.network)
  })

  it('tous les messages sont en typographie française (insécables, apostrophes courbes)', () => {
    for (const [key, text] of Object.entries(MESSAGES)) {
      expect(text, key).not.toMatch(/ [:;!?»]/)
      expect(text, key).not.toContain("'")
    }
  })

  it('format du code : exactement 6 chiffres', () => {
    expect(isCodeFormatOk('012345')).toBe(true)
    expect(isCodeFormatOk('12345')).toBe(false)
    expect(isCodeFormatOk('1234567')).toBe(false)
    expect(isCodeFormatOk('12 456')).toBe(false)
  })
})

describe('supabaseConfig · noms des variables et clé secrète', () => {
  const url = 'https://abcd.supabase.co'
  const jwt = (payload: object) =>
    `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`

  it('lit les noms Next.js créés par Supabase / Vercel (NEXT_PUBLIC_…)', () => {
    for (const keyName of [
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
    ] as const) {
      expect(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: url, [keyName]: 'sb_publishable_k' }, ''), keyName).toEqual({
        url,
        key: 'sb_publishable_k',
      })
    }
  })

  it('accepte aussi les variantes Vite et mélange les familles', () => {
    expect(supabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'a' }, '')).toEqual({ url, key: 'a' })
    expect(supabaseConfig({ VITE_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'b' }, '')).toEqual({ url, key: 'b' })
    // Le nom officiel passe devant les variantes, et une variable vide est ignorée.
    expect(
      supabaseConfig({ VITE_SUPABASE_URL: ' ', NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'c', VITE_SUPABASE_PUBLISHABLE_KEY: 'd' }, ''),
    ).toEqual({ url, key: 'd' })
  })

  it('refuse la clé secrète, sans jamais l’écrire dans la console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const key of ['sb_secret_abc123', jwt({ role: 'service_role', iss: 'supabase' })]) {
      expect(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }, '')).toBeNull()
      expect(JSON.stringify(spy.mock.calls)).not.toContain(key)
    }
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    expect(isSecretKey(jwt({ role: 'anon' }))).toBe(false)
    expect(isSecretKey('pas.un.jwt')).toBe(false)
    expect(isSecretKey('sb_publishable_x')).toBe(false)
  })
})

describe('supabaseConfig · vraie base ou maquette', () => {
  const env = { VITE_SUPABASE_URL: 'https://abcd.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xyz' }

  it('les deux variables présentes : la vraie base', () => {
    expect(supabaseConfig(env, '')).toEqual({ url: 'https://abcd.supabase.co', key: 'sb_publishable_xyz' })
  })

  it('?demo force la maquette', () => {
    expect(supabaseConfig(env, '?demo')).toBeNull()
    expect(supabaseConfig(env, '?as=arthus&demo=1')).toBeNull()
  })

  it('variable absente ou vide : la maquette', () => {
    expect(supabaseConfig({}, '')).toBeNull()
    expect(supabaseConfig({ VITE_SUPABASE_URL: env.VITE_SUPABASE_URL }, '')).toBeNull()
    expect(supabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: '  ' }, '')).toBeNull()
  })

  it('URL recopiée avec /rest/v1 (ou /auth/v1) : on garde juste l’adresse du projet (C3)', () => {
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...args: unknown[]) => warnings.push(args)
    try {
      for (const url of ['https://abcd.supabase.co/rest/v1', 'https://abcd.supabase.co/rest/v1/', 'https://abcd.supabase.co/auth/v1', ' https://abcd.supabase.co/REST/V1// ']) {
        expect(supabaseConfig({ ...env, VITE_SUPABASE_URL: url }, '')?.url, url).toBe('https://abcd.supabase.co')
      }
      expect(warnings).toHaveLength(4)
      expect(projectUrl('https://abcd.supabase.co')).toBe('https://abcd.supabase.co')
      expect(projectUrl('http://127.0.0.1:54321/')).toBe('http://127.0.0.1:54321')
      expect(warnings).toHaveLength(4)
    } finally {
      console.warn = warn
    }
  })

  it('URL qui n’en est pas une : la maquette plutôt qu’un plantage', () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      expect(supabaseConfig({ ...env, VITE_SUPABASE_URL: 'abcd.supabase.co' }, '')).toBeNull()
    } finally {
      console.warn = warn
    }
  })
})
