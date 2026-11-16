import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NBSP } from '../core/fr'
import { BUILD_INFO, buildLabel, versionText } from './build'
import { appMode, KEY_VARS, URL_VAR, type AppMode, type ModeEnv } from './mode'
import { secretKind } from './supabase/config'

/** base64url (sans « = »), comme dans un vrai JWT. */
function b64url(obj: object): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Faux JWT Supabase (ancienne clé anon / service_role) : la signature n'est jamais vérifiée ici. */
function fakeJwt(payload: object): string {
  // « >>>??? » force des « - » et « _ » dans l'encodage base64url du payload.
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'supabase', ref: 'abcd', x: '>>>???', ...payload })}.c2lnbmF0dXJlLWZhdXNzZQ`
}

const URL = 'https://abcd.supabase.co'
const PUBLISHABLE = 'sb_publishable_AbCdEf123'
const SECRET = 'sb_secret_TopSecret987'
const ANON_JWT = fakeJwt({ role: 'anon', iat: 1700000000, exp: 2000000000 })
const SERVICE_JWT = fakeJwt({ role: 'service_role', iat: 1700000000, exp: 2000000000 })

const OK: ModeEnv = { VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }

const prod = (env: ModeEnv, search = '') => appMode(env, search, true)
const dev = (env: ModeEnv, search = '') => appMode(env, search, false)

function expectSupabase(mode: AppMode) {
  if (mode.kind !== 'supabase') throw new Error(`attendu : supabase, reçu : ${mode.kind}`)
  return mode
}

function expectUnconfigured(mode: AppMode) {
  if (mode.kind !== 'unconfigured') throw new Error(`attendu : unconfigured, reçu : ${mode.kind}`)
  return mode.diagnosis
}

describe('appMode · la vraie base', () => {
  it('URL + clé publishable : la vraie base, en production comme en dev', () => {
    for (const mode of [prod(OK), dev(OK)]) {
      const m = expectSupabase(mode)
      expect(m.config).toEqual({ url: URL, key: PUBLISHABLE })
      expect(m.keyVar).toBe('VITE_SUPABASE_PUBLISHABLE_KEY')
    }
  })

  it('accepte chaque nom de clé proposé par le bouton « Connect » de Supabase', () => {
    for (const name of KEY_VARS) {
      const m = expectSupabase(prod({ VITE_SUPABASE_URL: URL, [name]: PUBLISHABLE }))
      expect(m.keyVar, name).toBe(name)
      expect(m.config.key, name).toBe(PUBLISHABLE)
    }
  })

  it('plusieurs noms de clé : le nom officiel d’abord, puis dans l’ordre des alias', () => {
    const all: ModeEnv = {
      VITE_SUPABASE_URL: URL,
      VITE_SUPABASE_KEY: 'sb_publishable_4',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_3',
      VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: 'sb_publishable_2',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1',
    }
    expect(expectSupabase(prod(all)).config.key).toBe('sb_publishable_1')
    expect(expectSupabase(prod({ ...all, VITE_SUPABASE_PUBLISHABLE_KEY: undefined })).config.key).toBe('sb_publishable_2')
    // Un nom vide (ou que des espaces) ne compte pas : on passe au suivant.
    const m = expectSupabase(prod({ ...all, VITE_SUPABASE_PUBLISHABLE_KEY: '  ', VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: '' }))
    expect(m.config.key).toBe('sb_publishable_3')
    expect(m.keyVar).toBe('VITE_SUPABASE_ANON_KEY')
    expect(expectSupabase(prod({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_KEY: 'sb_publishable_4', VITE_SUPABASE_ANON_KEY: ANON_JWT })).keyVar).toBe(
      'VITE_SUPABASE_ANON_KEY',
    )
  })

  it('noms Next.js créés par Supabase / Vercel (NEXT_PUBLIC_…) : la vraie base aussi', () => {
    for (const keyName of [
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
    ] as const) {
      for (const key of [PUBLISHABLE, ANON_JWT]) {
        const m = expectSupabase(prod({ NEXT_PUBLIC_SUPABASE_URL: URL, [keyName]: key }))
        expect(m.config, keyName).toEqual({ url: URL, key })
        expect(m.keyVar, keyName).toBe(keyName)
      }
    }
    // Les deux familles se mélangent ; à nom égal, VITE_… passe devant.
    expect(expectSupabase(prod({ VITE_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE })).config.url).toBe(URL)
    expect(
      expectSupabase(prod({ VITE_SUPABASE_URL: '  ', NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_n', VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }))
        .config,
    ).toEqual({ url: URL, key: PUBLISHABLE })
    expect(expectSupabase(prod({ VITE_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_URL: 'https://autre.supabase.co', ...{ VITE_SUPABASE_ANON_KEY: PUBLISHABLE } })).config.url).toBe(URL)
  })

  it('NEXT_PUBLIC_… : une clé secrète y est refusée comme ailleurs, même dans l’URL', () => {
    const d = expectUnconfigured(prod({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_JWT }, '?demo'))
    expect(d.problems[0]).toBe('secretKey')
    expect(d.secrets).toEqual([{ name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', kind: 'service_role' }])
    const inUrl = expectUnconfigured(prod({ NEXT_PUBLIC_SUPABASE_URL: SECRET, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }))
    expect(inUrl.secrets).toEqual([{ name: 'NEXT_PUBLIC_SUPABASE_URL', kind: 'sb_secret' }])
    expect(JSON.stringify(inUrl)).not.toContain(SECRET)
    // Une URL secrète sous l'autre nom est signalée même si VITE_SUPABASE_URL est bonne.
    const both = expectUnconfigured(prod({ ...OK, NEXT_PUBLIC_SUPABASE_URL: SECRET }))
    expect(both.secrets).toEqual([{ name: 'NEXT_PUBLIC_SUPABASE_URL', kind: 'sb_secret' }])
  })

  it('ancienne clé anon (JWT) : acceptée', () => {
    const m = expectSupabase(prod({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON_JWT }))
    expect(m.config.key).toBe(ANON_JWT)
  })

  it('espaces et guillemets autour des valeurs : enlevés', () => {
    const m = expectSupabase(prod({ VITE_SUPABASE_URL: `  "${URL}/"\n`, VITE_SUPABASE_PUBLISHABLE_KEY: ` \t${PUBLISHABLE}  ` }))
    expect(m.config).toEqual({ url: URL, key: PUBLISHABLE })
  })

  describe('URL recopiée avec un chemin d’API', () => {
    beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}))
    afterEach(() => vi.restoreAllMocks())

    it('on garde juste l’adresse du projet', () => {
      for (const url of [`${URL}/rest/v1`, `${URL}/rest/v1/`, `${URL}/auth/v1`, ` ${URL}/REST/V1// `]) {
        expect(expectSupabase(prod({ ...OK, VITE_SUPABASE_URL: url })).config.url, url).toBe(URL)
      }
    })
  })
})

describe('appMode · la maquette', () => {
  it('?demo dans l’adresse : la maquette (asked), même avec la config, même en production', () => {
    for (const search of ['?demo', '?demo=1', '?as=arthus&demo', '?demo=0']) {
      expect(prod(OK, search), search).toMatchObject({ kind: 'demo', reason: 'asked' })
      expect(prod({}, search), search).toMatchObject({ kind: 'demo', reason: 'asked' })
    }
    // Pas ?demo : un paramètre qui commence pareil ne compte pas.
    expect(prod(OK, '?demonstration').kind).toBe('supabase')
    expect(prod(OK, '#demo').kind).toBe('supabase')
  })

  it('VITE_DEMO=1 (maquette autonome) : la maquette (flag), même en production et avec la config', () => {
    for (const flag of ['1', 'true', ' TRUE ', 'oui']) {
      expect(prod({ VITE_DEMO: flag }), flag).toMatchObject({ kind: 'demo', reason: 'flag' })
      expect(prod({ ...OK, VITE_DEMO: flag }), flag).toMatchObject({ kind: 'demo', reason: 'flag' })
    }
    for (const off of ['0', 'false', '', ' ', undefined]) {
      expect(prod({ ...OK, VITE_DEMO: off }).kind, String(off)).toBe('supabase')
      expect(prod({ VITE_DEMO: off }).kind, String(off)).toBe('unconfigured')
    }
    // ?demo l'emporte sur le drapeau (même résultat, raison plus précise).
    expect(prod({ VITE_DEMO: '1' }, '?demo')).toMatchObject({ kind: 'demo', reason: 'asked' })
  })

  it('en développement sans config : la maquette (dev), avec ce qui manque', () => {
    expect(dev({})).toEqual({
      kind: 'demo',
      reason: 'dev',
      diagnosis: { found: [], keyVar: null, secrets: [], problems: ['missingUrl', 'missingKey'] },
    })
    expect(dev({ VITE_SUPABASE_URL: URL })).toMatchObject({ kind: 'demo', reason: 'dev', diagnosis: { problems: ['missingKey'] } })
    expect(dev({ ...OK, VITE_SUPABASE_URL: 'abcd' })).toMatchObject({
      kind: 'demo',
      reason: 'dev',
      diagnosis: { problems: ['invalidUrl'], urlHint: 'other' },
    })
  })
})

describe('appMode · pas branchée (production) : jamais de maquette en silence', () => {
  it('aucune variable : pas branchée, rien de trouvé', () => {
    expect(prod({})).toEqual({
      kind: 'unconfigured',
      diagnosis: { found: [], keyVar: null, secrets: [], problems: ['missingUrl', 'missingKey'] },
    })
  })

  it('il manque la clé, ou l’URL : on dit laquelle (noms seulement)', () => {
    expect(expectUnconfigured(prod({ VITE_SUPABASE_URL: URL }))).toEqual({
      found: [URL_VAR],
      keyVar: null,
      secrets: [],
      problems: ['missingKey'],
    })
    expect(expectUnconfigured(prod({ VITE_SUPABASE_ANON_KEY: PUBLISHABLE, VITE_SUPABASE_PUBLISHABLE_KEY: '' }))).toEqual({
      found: ['VITE_SUPABASE_ANON_KEY'],
      keyVar: 'VITE_SUPABASE_ANON_KEY',
      secrets: [],
      problems: ['missingUrl'],
    })
    expect(expectUnconfigured(prod({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).problems).toEqual(['missingUrl'])
  })

  it('URL invalide (pas une adresse, ou celle du tableau de bord) : invalidUrl', () => {
    for (const url of ['abcd', 'ftp://abcd.supabase.co', 'https://supabase.com/dashboard/project/abcd', PUBLISHABLE]) {
      const d = expectUnconfigured(prod({ ...OK, VITE_SUPABASE_URL: url }))
      expect(d.problems, url).toEqual(['invalidUrl'])
      expect(d.found, url).toEqual([URL_VAR, 'VITE_SUPABASE_PUBLISHABLE_KEY'])
    }
  })

  it('URL invalide : on dit ce qui cloche (base, tableau de bord, « .com » au lieu de « .co »)', () => {
    const hints: [string, string][] = [
      // UX-2 : la faute .com/.co passait pour une vraie base (« Vérifie ta connexion » ensuite).
      ['https://abcdefghijklmnop.supabase.com', 'dotCom'],
      ['abcdefghijklmnop.supabase.com', 'dotCom'],
      ['https://supabase.com/dashboard/project/abcd', 'dashboard'],
      ['https://app.supabase.com/project/abcd', 'dashboard'],
      ['postgresql://postgres:[YOUR-PASSWORD]@db.abcd.supabase.co:5432/postgres', 'database'],
      ['https://db.abcd.supabase.co', 'database'],
      ['aws-0-eu-west-3.pooler.supabase.com', 'database'],
      ['supabase.com/dashboard/project/abcd', 'dashboard'],
      ['https://aws-0-eu-west-3.pooler.supabase.com', 'database'],
      ['abcd', 'other'],
      ['ftp://abcd.supabase.co', 'other'],
    ]
    for (const [url, hint] of hints) {
      expect(expectUnconfigured(prod({ ...OK, VITE_SUPABASE_URL: url })), url).toMatchObject({ problems: ['invalidUrl'], urlHint: hint })
    }
    // Pas d'indice quand l'URL va bien, manque, ou contient un secret.
    expect(expectUnconfigured(prod({ VITE_SUPABASE_URL: URL })).urlHint).toBeUndefined()
    expect(expectUnconfigured(prod({ VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).urlHint).toBeUndefined()
    expect(expectUnconfigured(prod({ ...OK, VITE_SUPABASE_URL: SECRET })).urlHint).toBeUndefined()
  })

  it('« xxxx.supabase.co » sans https:// : accepté (on l’ajoute), et http:// devient https://', () => {
    for (const url of ['abcd.supabase.co', ' "abcd.supabase.co/" ', 'http://abcd.supabase.co', 'HTTPS://ABCD.SUPABASE.CO']) {
      expect(expectSupabase(prod({ ...OK, VITE_SUPABASE_URL: url })).config.url, url).toBe(URL)
    }
    // Le développement local (Supabase CLI) reste en http.
    expect(expectSupabase(dev({ ...OK, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })).config.url).toBe('http://127.0.0.1:54321')
  })
})

describe('appMode · clé secrète : refusée, et signalée en priorité', () => {
  it('sb_secret_ : pas branchée, problème secretKey en premier', () => {
    const d = expectUnconfigured(prod({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: SECRET }))
    expect(d).toEqual({
      found: [URL_VAR, 'VITE_SUPABASE_PUBLISHABLE_KEY'],
      keyVar: null,
      secrets: [{ name: 'VITE_SUPABASE_PUBLISHABLE_KEY', kind: 'sb_secret' }],
      problems: ['secretKey', 'missingKey'],
    })
  })

  it('JWT service_role (ancienne clé) : pareil', () => {
    const d = expectUnconfigured(prod({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: SERVICE_JWT }))
    expect(d.secrets).toEqual([{ name: 'VITE_SUPABASE_ANON_KEY', kind: 'service_role' }])
    expect(d.problems[0]).toBe('secretKey')
  })

  it('l’emporte sur tout : dev, ?demo, VITE_DEMO (la clé finit dans l’app de toute façon)', () => {
    const env: ModeEnv = { VITE_SUPABASE_URL: URL, VITE_SUPABASE_KEY: SECRET }
    for (const mode of [dev(env), prod(env, '?demo'), dev(env, '?demo'), prod({ ...env, VITE_DEMO: '1' })]) {
      expect(expectUnconfigured(mode).problems[0]).toBe('secretKey')
    }
  })

  it('même dans un alias qu’on n’utiliserait pas, ou dans l’URL : signalée', () => {
    const d = expectUnconfigured(prod({ ...OK, VITE_SUPABASE_KEY: ` ${SECRET} ` }))
    expect(d.keyVar).toBe('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(d.secrets).toEqual([{ name: 'VITE_SUPABASE_KEY', kind: 'sb_secret' }])
    expect(d.problems).toEqual(['secretKey'])

    const inUrl = expectUnconfigured(prod({ ...OK, VITE_SUPABASE_URL: SECRET }))
    expect(inUrl.secrets).toEqual([{ name: URL_VAR, kind: 'sb_secret' }])
    expect(inUrl.problems).toEqual(['secretKey', 'invalidUrl'])
  })

  it('clé secrète déguisée (guillemets courbes, « Bearer », invisible, coupée, point final) : reconnue quand même (F1)', () => {
    const disguised = [
      `“${SECRET}”`,
      `«${NBSP}${SECRET}${NBSP}»`,
      `‘${SECRET}’`,
      `\u200B${SECRET}`,
      `${SECRET}\u200B`,
      `Bearer ${SECRET}`,
      `apikey: ${SECRET}`,
      `sb_secret_Top\nSecret987`,
      `${SERVICE_JWT}.`,
      `“${SERVICE_JWT}”`,
      `Bearer ${SERVICE_JWT}`,
      `${SERVICE_JWT.slice(0, 50)}\n${SERVICE_JWT.slice(50)}`,
      `${SERVICE_JWT.slice(0, 60)} ${SERVICE_JWT.slice(60)}`,
      `${SERVICE_JWT.slice(0, 40)}\u00A0${SERVICE_JWT.slice(40)}`,
    ]
    for (const value of disguised) {
      expect(secretKind(value), JSON.stringify(value)).not.toBeNull()
      const env: ModeEnv = { VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: value }
      // Ni la vraie base, ni la maquette : l'avertissement rouge, même avec ?demo.
      for (const mode of [prod(env), prod(env, '?demo'), dev(env)]) {
        expect(expectUnconfigured(mode).problems[0], JSON.stringify(value)).toBe('secretKey')
      }
    }
  })

  it('mot de passe de la base dans VITE_SUPABASE_URL (chaîne de connexion) : un secret, pas « mauvaise adresse » (F2)', () => {
    const withPassword = [
      'postgresql://postgres:MonMotDePasse123@db.abcd.supabase.co:5432/postgres',
      'postgres://postgres:MonMotDePasse123@db.abcd.supabase.co:5432/postgres',
      // Pooler (Session / Transaction), mot de passe avec « @ » et « : ».
      'postgresql://postgres.abcd:Mon@Mot:De#Passe@aws-0-eu-west-3.pooler.supabase.com:6543/postgres',
      // Mot de passe tapé ENTRE les crochets de l'exemple.
      'postgresql://postgres:[MonMotDePasse123]@db.abcd.supabase.co:5432/postgres',
      'jdbc:postgresql://db.abcd.supabase.co:5432/postgres?user=postgres&password=MonMotDePasse123',
      'User Id=postgres;Password=MonMotDePasse123;Server=db.abcd.supabase.co;Port=5432;Database=postgres',
      'https://postgres:MonMotDePasse123@abcd.supabase.co',
    ]
    for (const url of withPassword) {
      expect(secretKind(url), url).toBe('db_password')
      const env: ModeEnv = { ...OK, VITE_SUPABASE_URL: url }
      for (const mode of [prod(env), prod(env, '?demo'), dev(env)]) {
        const d = expectUnconfigured(mode)
        expect(d.secrets, url).toEqual([{ name: URL_VAR, kind: 'db_password' }])
        expect(d.problems, url).toEqual(['secretKey', 'invalidUrl'])
        expect(JSON.stringify(mode), url).not.toContain('MonMot')
      }
    }
    // Le mot de passe d'exemple de Supabase n'en est pas un : juste une mauvaise adresse.
    for (const url of [
      'postgresql://postgres:[YOUR-PASSWORD]@db.abcd.supabase.co:5432/postgres',
      'postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:6543/postgres',
      'postgresql://postgres@db.abcd.supabase.co:5432/postgres',
    ]) {
      expect(secretKind(url), url).toBeNull()
      expect(expectUnconfigured(prod({ ...OK, VITE_SUPABASE_URL: url })), url).toMatchObject({ secrets: [], problems: ['invalidUrl'], urlHint: 'database' })
    }
  })

  it('le diagnostic ne contient aucune valeur (ni clé, ni URL)', () => {
    const modes = [
      prod({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: SECRET, VITE_SUPABASE_ANON_KEY: SERVICE_JWT }),
      prod({ VITE_SUPABASE_URL: 'https://supabase.com/dashboard/project/abcd', VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }),
      dev(OK, '?demo'),
      prod({ ...OK, VITE_DEMO: '1' }),
    ]
    for (const mode of modes) {
      const json = JSON.stringify(mode)
      for (const value of [SECRET, 'TopSecret', SERVICE_JWT, PUBLISHABLE, 'abcd']) expect(json).not.toContain(value)
    }
  })
})

describe('secretKind', () => {
  it('reconnaît les clés secrètes, nouvelles et anciennes', () => {
    expect(SERVICE_JWT.split('.')[1]).toMatch(/[-_]/)
    expect(secretKind(SECRET)).toBe('sb_secret')
    expect(secretKind(`  "${SECRET}" `)).toBe('sb_secret')
    expect(secretKind(SERVICE_JWT)).toBe('service_role')
    expect(secretKind(fakeJwt({ role: 'supabase_admin' }))).toBe('service_role')
  })

  it('laisse passer les clés publiques et ce qui n’est pas un JWT lisible', () => {
    for (const value of [
      PUBLISHABLE,
      ANON_JWT,
      `“${ANON_JWT}”`,
      `Bearer ${ANON_JWT}.`,
      fakeJwt({ role: 'authenticated' }),
      fakeJwt({}),
      'a.b.c',
      'pas.du.%%%',
      '',
      'sb_secretish',
      URL,
      'https://abcd.supabase.co:443/rest/v1',
      'http://127.0.0.1:54321',
    ]) {
      expect(secretKind(value), value).toBeNull()
    }
  })
})

describe('version du build', () => {
  const NOV = new Date('2026-11-20T10:00:00Z')

  it('date et heure de Paris, et le commit', () => {
    expect(buildLabel({ date: '2026-11-16T13:32:05.123Z', commit: 'a1b2c3d' }, NOV)).toBe(`16${NBSP}novembre à${NBSP}14:32 · a1b2c3d`)
    expect(buildLabel({ date: '2026-11-16T13:32:05.123Z', commit: null }, NOV)).toBe(`16${NBSP}novembre à${NBSP}14:32`)
    // Heure d'été, 1er du mois.
    expect(buildLabel({ date: '2026-07-01T12:05:00Z', commit: null }, NOV)).toBe(`1er${NBSP}juillet à${NBSP}14:05`)
    // Après 23:00 UTC en hiver : déjà le lendemain à Paris.
    expect(buildLabel({ date: '2026-11-16T23:30:00Z', commit: null }, NOV)).toBe(`17${NBSP}novembre à${NBSP}00:30`)
  })

  it('l’année seulement si ce n’est pas celle d’aujourd’hui', () => {
    expect(buildLabel({ date: '2026-11-16T13:32:00Z', commit: null }, new Date('2027-01-03T10:00:00Z'))).toBe(
      `16${NBSP}novembre 2026 à${NBSP}14:32`,
    )
  })

  it('« Version du … », ou rien si inconnue ou illisible', () => {
    expect(versionText({ date: '2026-11-16T13:32:00Z', commit: 'a1b2c3d' }, NOV)).toBe(`Version du 16${NBSP}novembre à${NBSP}14:32 · a1b2c3d`)
    expect(versionText(null)).toBeNull()
    expect(buildLabel({ date: 'pas une date', commit: null })).toBeNull()
  })

  it('__BUILD_INFO__ est défini par vite.config.ts (aussi sous Vitest)', () => {
    expect(BUILD_INFO).not.toBeNull()
    expect(Number.isNaN(new Date(BUILD_INFO!.date).getTime())).toBe(false)
  })
})
