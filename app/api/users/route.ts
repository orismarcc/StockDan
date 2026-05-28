import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can, canManageUser, type Role } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { withinLength, MAX_NAME_LENGTH, MAX_EMAIL_LENGTH } from '@/lib/validate'
import bcrypt from 'bcryptjs'

const VALID_NEW_ROLES: ReadonlyArray<Role> = ['admin', 'agronomo', 'operario']

export async function GET() {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.list')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password, created_at')
    .eq('gestor_id', session.gestor_id)
    .neq('id', session.id)
    .order('name')

  if (error) {
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.create')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const { name, email, password, role } = body as { name?: string; email?: string; password?: string; role?: string }

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Nome, e-mail, senha e cargo são obrigatórios.' }, { status: 400 })
  }
  if (typeof name === 'string' && !withinLength(name, MAX_NAME_LENGTH)) {
    return NextResponse.json({ error: `Nome excede ${MAX_NAME_LENGTH} caracteres.` }, { status: 400 })
  }
  if (typeof email === 'string' && !withinLength(email, MAX_EMAIL_LENGTH)) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }
  if (!VALID_NEW_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })
  }
  if (!canManageUser(session.role, role as Role)) {
    return NextResponse.json({ error: 'Sem permissão para este cargo.' }, { status: 403 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabase
    .from('users')
    .insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      role,
      gestor_id: session.gestor_id,    // P8: herda tenant do criador
      created_by: session.id,
      must_change_password: true,
      token_version: 0,
    })
    .select('id, name, email, role')
    .single()

  if (error) {
    // 23505 = unique violation (email duplicado)
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
