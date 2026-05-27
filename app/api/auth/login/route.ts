import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase'
import { createToken, COOKIE } from '@/lib/auth'
import { checkRateLimit, recordFailure, resetAttempts } from '@/lib/rateLimiter'
import { parseBody } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const { allowed, retryAfterSecs } = checkRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${retryAfterSecs} segundos.` },
      { status: 429 }
    )
  }

  const body = await parseBody<{ email?: string; password?: string }>(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, password_hash, role, must_change_password, token_version')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!user) {
    recordFailure(ip)
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    recordFailure(ip)
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
  }

  resetAttempts(ip)

  const token = await createToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password,
    tv: user.token_version ?? 0,
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
