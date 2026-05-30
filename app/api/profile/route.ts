import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getActiveSession, createToken, COOKIE } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { parseBody } from '@/lib/utils'
import { withinLength, trimField } from '@/lib/validate'
import { withAuth } from '@/lib/withAuth'

/** GET /api/profile — retorna nome e idade do usuário autenticado */
export const GET = withAuth(async (_req, session) => {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('users')
    .select('name, age')
    .eq('id', session.id)
    .single()
  return NextResponse.json({ name: data?.name ?? session.name, age: data?.age ?? null })
})

/**
 * PATCH /api/profile
 *
 * Atualiza informações do perfil do usuário autenticado.
 * Campos aceitos:
 *   - name: string (obrigatório, mínimo 2 chars)
 *   - age: number | null (opcional, 1-120)
 *   - currentPassword + newPassword: se ambos presentes, troca a senha
 *
 * Se o nome mudar, re-emite o JWT para manter o cookie sincronizado.
 */
export async function PATCH(req: NextRequest) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await parseBody<{
    name?: string
    age?: number | null
    currentPassword?: string
    newPassword?: string
  }>(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const name = trimField(body.name)
  const age  = body.age !== undefined ? body.age : undefined

  // Validações de perfil
  if (name !== undefined) {
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Nome deve ter pelo menos 2 caracteres.' }, { status: 400 })
    }
    if (!withinLength(name, 120)) {
      return NextResponse.json({ error: 'Nome excede 120 caracteres.' }, { status: 400 })
    }
  }

  if (age !== undefined && age !== null) {
    const ageNum = Number(age)
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      return NextResponse.json({ error: 'Idade inválida (1-120).' }, { status: 400 })
    }
  }

  const supabase = createServerClient()
  const updates: Record<string, unknown> = {}

  if (name !== undefined)  updates.name = name
  if (age  !== undefined)  updates.age  = age ?? null

  // --- Troca de senha (opcional) ---
  const { currentPassword, newPassword } = body
  if (currentPassword || newPassword) {
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Informe a senha atual e a nova senha.' },
        { status: 400 }
      )
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 })
    }

    // Busca hash atual para verificar senha atual
    const { data: user } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', session.id)
      .single()

    if (!user) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

    const match = await bcrypt.compare(currentPassword, user.password_hash)
    if (!match) {
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
    }

    updates.password_hash = await bcrypt.hash(newPassword, 10)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', session.id)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })

  // Re-emite JWT se o nome mudou (nome está no token)
  const nameChanged = name !== undefined && name !== session.name
  const res = NextResponse.json({ ok: true })

  if (nameChanged) {
    const token = await createToken({ ...session, name: name! })
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
  }

  return res
}
