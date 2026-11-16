/**
 * Écran « pas branchée » rendu en HTML (sans navigateur) : ce qu'Arthus lit, selon le
 * diagnostic. Les valeurs des variables n'arrivent jamais jusqu'ici (seulement des noms).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { appMode, type Diagnosis, type ModeEnv } from '../data/mode'
import { NOT_CONNECTED_TITLE, NotConnectedScreen, notConnectedLead } from './NotConnectedScreen'

const URL = 'https://abcd.supabase.co'
const PUBLISHABLE = 'sb_publishable_AbCdEf123'

function diagnosisOf(env: ModeEnv): Diagnosis {
  const mode = appMode(env, '', true)
  if (mode.kind !== 'unconfigured') throw new Error(`attendu : unconfigured, reçu : ${mode.kind}`)
  return mode.diagnosis
}

/** Le HTML de l'écran, insécables remplacées par des espaces (plus simple à lire dans les tests). */
function html(env: ModeEnv): string {
  return renderToStaticMarkup(createElement(NotConnectedScreen, { diagnosis: diagnosisOf(env) })).replace(/ /g, ' ')
}

/** Le texte seul (sans balises), pour chercher des phrases. */
function text(env: ModeEnv): string {
  return html(env)
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
}

const CASES: Record<string, ModeEnv> = {
  rien: {},
  'URL seule': { VITE_SUPABASE_URL: URL },
  'URL fausse': { VITE_SUPABASE_URL: 'https://abcd.supabase.com', VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
  'clé secrète': { VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_TopSecret987' },
  'mot de passe de la base': {
    VITE_SUPABASE_URL: 'postgresql://postgres:MonMotDePasse123@db.abcd.supabase.co:5432/postgres',
    VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
  },
}

describe('NotConnectedScreen · les textes (UX-5)', () => {
  it('tutoiement partout : jamais « votre » / « vous » à côté de « te »', () => {
    expect(NOT_CONNECTED_TITLE).toContain('ta base')
    for (const [label, env] of Object.entries(CASES)) {
      expect(text(env), label).not.toMatch(/\b(votre|vos|vous)\b/i)
    }
  })

  it('le sous-titre colle au diagnostic : rien reçu, un réglage qui cloche, ou un secret', () => {
    expect(notConnectedLead(diagnosisOf({}))).toMatch(/^Elle ne trouve pas les réglages de ta base/)
    // Une variable reçue (même bonne) : on ne dit plus « elle ne trouve pas les réglages ».
    for (const env of [CASES['URL seule'], CASES['URL fausse']]) {
      const lead = notConnectedLead(diagnosisOf(env))
      expect(lead).toMatch(/^Il lui manque un réglage de ta base Supabase, ou il n’est pas bon/)
      expect(lead).not.toContain('ne trouve pas')
    }
    expect(notConnectedLead(diagnosisOf(CASES['clé secrète']))).toMatch(/^Elle a reçu un secret/)
  })

  it('l’étape 4 cite le bouton sous son vrai nom, et « chaque nom » pour les deux variables', () => {
    const t = text({})
    expect(t).toContain('🔄 J’ai redéployé : recharger')
    expect(t).toContain('touche « J’ai redéployé : recharger » ci-dessous')
    expect(t).not.toMatch(/touche « Recharger »/)
    expect(t).toContain('Chaque nom doit être exactement celui affiché')
  })

  it('URL fausse : on dit ce qui cloche (ici « .com » au lieu de « .co »), pas « tableau de bord »', () => {
    const t = text(CASES['URL fausse'])
    expect(t).toContain('elle finit par .supabase.com')
    expect(t).not.toContain('tableau de bord')
    expect(text({ VITE_SUPABASE_URL: 'postgresql://postgres:[YOUR-PASSWORD]@db.abcd.supabase.co:5432/postgres' })).toContain(
      'c’est l’adresse de la base de données',
    )
  })
})

describe('NotConnectedScreen · secrets publiés', () => {
  it('clé secrète : l’alerte rouge de la clé', () => {
    const t = text(CASES['clé secrète'])
    expect(t).toContain('Stop : c’est la clé secrète !')
    expect(t).toContain('API Keys : régénère la clé secrète')
    expect(t).not.toContain('Voir la maquette')
  })

  it('mot de passe de la base dans l’URL (F2) : l’alerte dit de le changer et de remettre le Project URL', () => {
    const t = text(CASES['mot de passe de la base'])
    expect(t).toContain('Stop : c’est le mot de passe de la base !')
    expect(t).toContain('contient le mot de passe de ta base Supabase')
    expect(t).toContain('Reset database password')
    expect(t).toContain('le Project URL (Supabase › Connect), du genre https://xxxx.supabase.co, puis Redeploy')
    expect(t).not.toContain('API Keys')
    expect(t).not.toContain('Voir la maquette')
    // Jamais la valeur : ni le mot de passe, ni l'hôte.
    expect(html(CASES['mot de passe de la base'])).not.toMatch(/MonMot|abcd/)
  })
})

describe('NotConnectedScreen · mise en page', () => {
  it('noms de variables coupés seulement après un « _ » (UX-6 : jamais « …PUBLISHABLE_KE / Y »)', () => {
    for (const env of Object.values(CASES)) {
      const h = html(env)
      // Les noms (<code>) ne se coupent jamais n'importe où ; les exemples d'adresse, si.
      expect(h).not.toMatch(/<code[^>]*overflow-wrap:anywhere/)
      expect(h).toContain('VITE_<wbr/>SUPABASE_<wbr/>PUBLISHABLE_<wbr/>KEY')
      expect(h).toContain('VITE_<wbr/>SUPABASE_<wbr/>URL')
    }
  })

  it('aucun texte en text-muted (contraste trop faible en clair, UX-7)', () => {
    for (const env of Object.values(CASES)) expect(html(env)).not.toContain('text-muted')
  })
})
