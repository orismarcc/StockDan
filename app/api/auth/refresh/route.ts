import { NextResponse } from 'next/server'
import { getSession, createToken, COOKIE } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

/**
 * POST /api/auth/refresh
 *
 * Reemite o JWT com TTL fresco (7d). Usado pelo cliente sempre que detecta
 * online — assim, usuario que fica offline por dias nao acorda com cookie
 * expirado.
 *
 * Requer JWT atual valido (assinatura + token_version). Se JWT expirou,
 * retorna 401 e cliente vai pro login.
 *
 * Atualiza tambem must_change_password e role do DB — caso tenham mudado
 * desde o ultimo login.
 */
export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  }

  // Busca dados atualizados do DB (role, name, must_change_password, token_version)
  const supabase = createServerClient()
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password, token_version')
    .eq('id', session.id)
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 401 })
  }

  // Reemite token com payload fresco
  const token = await createToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.must_change_password,
    tv: user.token_version ?? 0,
  })

  const res = NextResponse.json({ ok: true, mustChangePassword: user.must_change_password })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
