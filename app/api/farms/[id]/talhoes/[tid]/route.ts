import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { can } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { parseBody } from '@/lib/utils'
import { trimField, isValidAreaHa, withinLength } from '@/lib/validate'

type Params = { params: Promise<{ id: string; tid: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'talhao.write')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const updated_at_client = body.updated_at_client ?? null

  const name = trimField(body.name)
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!withinLength(name, 120)) return NextResponse.json({ error: 'Nome excede 120 caracteres.' }, { status: 400 })
  if (!isValidAreaHa(body.area_ha)) {
    return NextResponse.json({ error: 'Área deve ser maior que zero (máx. 9.999.999 ha).' }, { status: 400 })
  }
  const area_ha = Number(body.area_ha)

  // [LWW]
  if (updated_at_client) {
    const { data: current } = await supabase
      .from('talhoes').select('*').eq('id', tid).eq('farm_id', farm_id).maybeSingle()
    if (current && current.updated_at && current.updated_at > updated_at_client) {
      return NextResponse.json(current, {
        status: 200,
        headers: { 'X-Conflict-Resolution': 'server-wins' },
      })
    }
  }

  const { data, error } = await supabase
    .from('talhoes')
    .update({ name, area_ha, updated_at_client: updated_at_client || null })
    .eq('id', tid)
    .eq('farm_id', farm_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  // P9: exclusão de talhão é restrita a Gestor/Admin (ação destrutiva)
  if (!can(session.role, 'talhao.delete')) {
    return NextResponse.json({ error: 'Sem permissão para excluir talhão.' }, { status: 403 })
  }

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  // Snapshot ANTES de deletar (para o audit log)
  const { data: snap } = await supabase
    .from('talhoes')
    .select('name, area_ha')
    .eq('id', tid)
    .eq('farm_id', farm_id)
    .maybeSingle()

  const { error } = await supabase
    .from('talhoes')
    .delete()
    .eq('id', tid)
    .eq('farm_id', farm_id)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })

  await logAudit(supabase, session, {
    action: 'delete',
    entity: 'talhao',
    entity_id: tid,
    farm_id,
    summary: snap ? `Excluiu talhão "${snap.name}" (${Number(snap.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha)` : `Excluiu talhão`,
    changes: snap ? { before: snap } : undefined,
  })

  return NextResponse.json({ ok: true })
}
