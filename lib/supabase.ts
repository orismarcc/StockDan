import { createClient } from '@supabase/supabase-js'

// Remove BOM (U+FEFF) que o Windows pode injetar no início de env vars
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  }

  return createClient(stripBom(url), stripBom(key), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
