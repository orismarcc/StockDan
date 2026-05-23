import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession, createToken, COOKIE } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { parseBody } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const body = await parseBody<{ name?: string; password?: string }>(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { name, password } = body

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: 'Informe seu nome completo.' }, { status: 400 })
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 10)
  const supabase = createServerClient()

  const { error } = await supabase
    .from('users')
    .update({ name: name.trim(), password_hash: hash, must_change_password: false })
    .eq('id', session.id)

  if (error) {
    return NextResponse.json({ error: 'Erro ao atualizar dados.' }, { status: 500 })
  }

  const token = await createToken({
    ...session,
    name: name.trim(),
    mustChangePassword: false,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  return res
}
