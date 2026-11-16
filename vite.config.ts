/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { NEXT_PUBLIC_VARS } from './src/data/envNames.ts'

/**
 * Date du build et commit déployé (Vercel donne VERCEL_GIT_COMMIT_SHA) : affichés dans
 * Réglages et sur l'écran « pas branchée », pour voir si Vercel a bien redéployé.
 * Aussi défini sous Vitest, qui lit ce fichier.
 */
const BUILD_INFO = {
  date: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
}

/**
 * Variables Supabase aux noms Next.js (NEXT_PUBLIC_SUPABASE_URL…, créées par Supabase ou
 * l'intégration Vercel) : Vite ne les lit pas d'office. On copie dans l'app CES NOMS-LÀ
 * uniquement (liste blanche), jamais le reste de l'environnement (SUPABASE_SERVICE_ROLE_KEY,
 * POSTGRES_…, qui doivent rester côté serveur).
 */
function nextPublicEnv(mode: string): Record<string, string> {
  const files = loadEnv(mode, process.cwd(), 'NEXT_PUBLIC_')
  const out: Record<string, string> = {}
  for (const name of NEXT_PUBLIC_VARS) {
    const value = process.env[name] ?? files[name]
    if (value) out[name] = value
  }
  return out
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Chemins relatifs : l'app marche aussi servie depuis un sous-dossier (aperçu de la maquette).
  base: './',
  // ⚠️ Pas d'envPrefix : seules les variables VITE_* sont lisibles par l'app (voir src/data/env.ts),
  // plus la liste blanche NEXT_PUBLIC_SUPABASE_… ci-dessus.
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_INFO__: JSON.stringify(BUILD_INFO),
    __NEXT_PUBLIC_ENV__: JSON.stringify(nextPublicEnv(mode)),
  },
  server: { host: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}))
