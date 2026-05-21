import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase'
import { createToken, COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('[login] env check — url:', supabaseUrl ? 'ok' : 'MISSING', '| key:', supabaseKey ? 'ok' : 'MISSING')

  const supabase = createServerClient()
  const { data: user, error: dbErr } = await supabase
    .from('users')
    .select('id, name, email, password_hash, role, must_change_password')
    .eq('email', email.toLowerCase().trim())
    .single()

  console.log('[login] email:', email.toLowerCase().trim(), '| user found:', !!user, '| dbErr:', dbErr?.message ?? 'none')

  if (!user) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  console.log('[login] bcrypt valid:', valid)
  if (!valid) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
  }

  const token = await createToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password,
  })

  const res = NextResponse.json({
    ok: true,
    mustChangePassword: user.must_change_password,
  })

  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  })

  return res
}
