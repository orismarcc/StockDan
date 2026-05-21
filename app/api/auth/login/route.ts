import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase'
import { createToken, COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, password_hash, role, must_change_password')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!user) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
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
    maxAge: 60 * 60 * 24 * 7,
  })

  return res
}
