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

const admins = [
  { email: 'orismar.bm@gmail.com', password: 'admin123' },
  { email: 'daniel@stockdan.com',  password: 'admin123' },
]

async function main() {
  for (const admin of admins) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', admin.email)
      .single()

    if (existing) {
      console.log(`Já existe: ${admin.email}`)
      continue
    }

    const hash = await bcrypt.hash(admin.password, 10)
    const placeholderName = admin.email.split('@')[0]

    const { error } = await supabase.from('users').insert({
      name: placeholderName,
      email: admin.email,
      password_hash: hash,
      role: 'admin',
      must_change_password: true,
    })

    if (error) {
      console.error(`Erro ao criar ${admin.email}:`, error.message)
    } else {
      console.log(`✓ Admin criado: ${admin.email} (senha temporária: ${admin.password})`)
    }
  }
}

main()
