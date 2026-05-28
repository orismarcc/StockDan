import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getActiveSession, invalidateTokenVersionCache } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can, canManageUser, type Role } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { isUUID } from '@/lib/validate'

type Params = { params: Promise<{ uid: string }> }

const VALID_EDIT_ROLES: ReadonlyArray<Role> = ['admin', 'agronomo', 'operario']

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.edit')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { uid } = await params
  if (!isUUID(uid)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // P8: target deve estar no mesmo tenant
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, gestor_id, must_change_password, created_at')
    .eq('id', uid)
    .eq('gestor_id', session.gestor_id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  const { data: farmLinks } = await supabase
    .from('farm_users')
    .select('farms(id, name, city, state)')
    .eq('user_id', uid)

  return NextResponse.json({
    ...data,
    farms: farmLinks?.map((f: { farms: unknown }) => f.farms) ?? [],
  })
}

/**
 * PATCH (REST canônico) + PUT (alias compat com UserEditor atual).
 * Atualiza nome, cargo, senha e/ou farm_ids do usuário.
 *
 * P8: target precisa estar no mesmo tenant (gestor_id).
 *     farm_ids precisam ter owner_id = session.gestor_id.
 * P9: can('user.edit') + canManageUser(actor, target).
 * P5: mudança de role incrementa token_version + invalida cache (força relogin).
 */
async function patchHandler(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.edit')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { uid } = await params
  if (!isUUID(uid)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const supabase = createServerClient()

  // P8: target deve estar no mesmo tenant
  const { data: target } = await supabase
    .from('users')
    .select('id, role, gestor_id, token_version')
    .eq('id', uid)
    .maybeSingle()

  if (!target || target.gestor_id !== session.gestor_id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  if (!canManageUser(session.role, target.role)) {
    return NextResponse.json({ error: 'Sem permissão para este usuário.' }, { status: 403 })
  }

  // Preparar updates
  const updates: Record<string, unknown> = {}
  let roleChanged = false

  if (typeof body.name === 'string') updates.name = body.name.trim()

  if (typeof body.role === 'string' && body.role !== target.role) {
    if (!VALID_EDIT_ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })
    }
    if (!canManageUser(session.role, body.role as Role)) {
      return NextResponse.json({ error: 'Sem permissão para este cargo.' }, { status: 403 })
    }
    updates.role = body.role
    updates.token_version = (target.token_version ?? 0) + 1   // P5
    roleChanged = true
  }

  // Password reset (preserva funcionalidade existente — admin pode redefinir senha)
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
    }
    updates.password_hash = await bcrypt.hash(body.password, 10)
    updates.must_change_password = true
    // Também invalida sessões atuais — usuário precisa relogar com a nova senha
    updates.token_version = (target.token_version ?? 0) + 1
    roleChanged = true   // reusa o flag para acionar invalidateTokenVersionCache
  }

  // P8: farm_ids — todas precisam pertencer ao tenant
  let farm_ids: string[] | null = null
  if (Array.isArray(body.farm_ids)) {
    if (!body.farm_ids.every((id: unknown) => typeof id === 'string' && isUUID(id))) {
      return NextResponse.json({ error: 'farm_ids inválido.' }, { status: 400 })
    }
    farm_ids = body.farm_ids as string[]
    if (farm_ids.length > 0) {
      const { data: owned } = await supabase
        .from('farms')
        .select('id')
        .eq('owner_id', session.gestor_id)
        .in('id', farm_ids)
      if ((owned?.length ?? 0) !== farm_ids.length) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
      }
    }
  }

  // Aplicar updates de campos do user
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('users').update(updates).eq('id', uid)
    if (error) {
      return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    }
    if (roleChanged) invalidateTokenVersionCache(uid)
  }

  // Aplicar farm_users (substitui conjunto completo)
  if (farm_ids !== null) {
    const { error: delErr } = await supabase.from('farm_users').delete().eq('user_id', uid)
    if (delErr) {
      return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    }
    if (farm_ids.length > 0) {
      const rows = farm_ids.map((fid) => ({ user_id: uid, farm_id: fid }))
      const { error: insErr } = await supabase.from('farm_users').insert(rows)
      if (insErr) {
        return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = patchHandler
export const PUT = patchHandler   // alias compat — UserEditor atual usa PUT

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.delete')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { uid } = await params
  if (!isUUID(uid)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }
  if (uid === session.id) {
    return NextResponse.json({ error: 'Não é possível excluir o próprio usuário.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: target } = await supabase
    .from('users')
    .select('id, role, gestor_id')
    .eq('id', uid)
    .maybeSingle()

  if (!target || target.gestor_id !== session.gestor_id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  if (!canManageUser(session.role, target.role)) {
    return NextResponse.json({ error: 'Sem permissão para este usuário.' }, { status: 403 })
  }

  const { error } = await supabase.from('users').delete().eq('id', uid)
  if (error) {
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
  invalidateTokenVersionCache(uid)
  return NextResponse.json({ ok: true })
}
