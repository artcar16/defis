import { describe, expect, it } from 'vitest'
import { cleanValue, parseProjectUrl, projectHost, projectUrl } from './config'
import { classifyError, isCodeFormatOk, MESSAGES, offlineHint, toUserMessage } from './errors'

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

describe('serveur injoignable : on montre l’adresse utilisée (UX-2)', () => {
  it('« Impossible de joindre le serveur » sur la vraie base : l’hôte, et où le corriger', () => {
    const hint = offlineHint(MESSAGES.offline, 'abcdefghijklmnop.supabase.com')
    expect(hint).toContain('abcdefghijklmnop.supabase.com')
    expect(hint).toContain('VITE_SUPABASE_URL')
    expect(hint).toContain('.supabase.co')
    expect(hint).toContain('pas en pause')
    expect(hint).toContain('Serveur utilisé\u00a0: ')
  })

  it('rien pour les autres problèmes, ni en maquette (pas d’hôte)', () => {
    for (const problem of [null, MESSAGES.stale, MESSAGES.badKey, MESSAGES.dbNotReady, MESSAGES.serverError]) {
      expect(offlineHint(problem, 'abcd.supabase.co')).toBeNull()
    }
    expect(offlineHint(MESSAGES.offline, null)).toBeNull()
  })
})

describe('config · URL du projet et clés (le choix du mode : ../mode.test.ts)', () => {
  it('URL recopiée avec /rest/v1 (ou /auth/v1) : on garde juste l’adresse du projet (C3)', () => {
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...args: unknown[]) => warnings.push(args)
    try {
      for (const url of ['https://abcd.supabase.co/rest/v1', 'https://abcd.supabase.co/rest/v1/', 'https://abcd.supabase.co/auth/v1', ' https://abcd.supabase.co/REST/V1// ']) {
        expect(parseProjectUrl(url), url).toBe('https://abcd.supabase.co')
      }
      expect(warnings).toHaveLength(4)
      expect(projectUrl('https://abcd.supabase.co')).toBe('https://abcd.supabase.co')
      expect(projectUrl('http://127.0.0.1:54321/')).toBe('http://127.0.0.1:54321')
      expect(warnings).toHaveLength(4)
      // On ne journalise jamais que le bout de chemin enlevé.
      expect(JSON.stringify(warnings)).not.toContain('abcd')
    } finally {
      console.warn = warn
    }
  })

  it('URL qui n’en est pas une, ou adresse du tableau de bord : null (pas de plantage)', () => {
    for (const url of [
      'sb_publishable_xyz',
      'ftp://abcd.supabase.co',
      '',
      '   ',
      'https://supabase.com/dashboard/project/abcd',
      'https://app.supabase.com/project/abcd',
      // UX-2 : « .com » au lieu de « .co », la base elle-même, le pooler, des identifiants.
      'https://abcdefghijklmnop.supabase.com',
      'https://db.abcd.supabase.co',
      'https://aws-0-eu-west-3.pooler.supabase.com',
      'https://user:pass@abcd.supabase.co',
      'postgresql://postgres:[YOUR-PASSWORD]@db.abcd.supabase.co:5432/postgres',
    ]) {
      expect(parseProjectUrl(url), url).toBeNull()
    }
    expect(parseProjectUrl('"https://abcd.supabase.co"')).toBe('https://abcd.supabase.co')
    expect(parseProjectUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321')
    // Sans https:// devant, ou en http : c'est bien le projet (https ajouté).
    expect(parseProjectUrl('abcd.supabase.co')).toBe('https://abcd.supabase.co')
    expect(parseProjectUrl('http://abcd.supabase.co/')).toBe('https://abcd.supabase.co')
  })

  it('hôte du projet (public) pour les Réglages', () => {
    expect(projectHost('https://abcd.supabase.co')).toBe('abcd.supabase.co')
    expect(projectHost('http://127.0.0.1:54321')).toBe('127.0.0.1:54321')
  })

  it('valeurs nettoyées : espaces et guillemets autour', () => {
    expect(cleanValue('  sb_publishable_x  ')).toBe('sb_publishable_x')
    expect(cleanValue('"sb_publishable_x"')).toBe('sb_publishable_x')
    expect(cleanValue(" 'sb_publishable_x' ")).toBe('sb_publishable_x')
    expect(cleanValue('"sb_publishable_x')).toBe('"sb_publishable_x')
    expect(cleanValue(undefined)).toBe('')
  })
})
