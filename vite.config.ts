/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { SUPABASE_ENV_NAMES } from './src/data/supabase/config.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Variables Supabase publiques, noms VITE_… ou NEXT_PUBLIC_… (créés par Supabase / l'intégration
  // Vercel). On ne copie dans l'app QUE ces noms-là : jamais les autres variables du projet
  // (SUPABASE_SERVICE_ROLE_KEY, POSTGRES_…), qui doivent rester côté serveur.
  const files = loadEnv(mode, process.cwd(), '')
  const supabaseEnv: Record<string, string> = {}
  for (const name of SUPABASE_ENV_NAMES) {
    const value = process.env[name] ?? files[name]
    if (value) supabaseEnv[name] = value
  }

  return {
    // Chemins relatifs : l'app marche aussi servie depuis un sous-dossier (aperçu de la maquette).
    base: './',
    plugins: [react(), tailwindcss()],
    define: { __SUPABASE_ENV__: JSON.stringify(supabaseEnv) },
    server: { host: true },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  }
})
