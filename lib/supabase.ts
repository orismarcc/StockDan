import { createClient } from '@supabase/supabase-js'

// Remove BOM (U+FEFF) e whitespace que o Windows pode injetar em env vars
function cleanEnv(s: string): string {
  return s.replace(/^﻿/, '').trim()
}

export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  }

  return createClient(cleanEnv(url), cleanEnv(key), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
