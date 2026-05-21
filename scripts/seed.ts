/**
 * Cria o primeiro usuário administrador no banco de dados.
 *
 * Uso:
 *   npx tsx scripts/seed.ts
 *
 * Pré-requisito: arquivo .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 */

import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const email = 'admin@stockdan.com'
  const password = 'StockDan@2026'

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) {
    console.log(`Administrador já existe: ${email}`)
    return
  }

  const hash = await bcrypt.hash(password, 10)

  const { error } = await supabase.from('users').insert({
    name: 'Administrador',
    email,
    password_hash: hash,
    role: 'admin',
    must_change_password: true,
  })

  if (error) {
    console.error('Erro ao criar administrador:', error.message)
    process.exit(1)
  }

  console.log('✓ Administrador criado com sucesso!')
  console.log(`  Email: ${email}`)
  console.log(`  Senha: ${password}`)
  console.log('  (será solicitada a troca de senha no primeiro acesso)')
}

main()
