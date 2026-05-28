import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { can } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { parseBody } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Fazenda não encontrada.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'farm.edit')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody<{ name?: string; city?: string; state?: string; farmer_name?: string; updated_at_client?: string }>(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { name, city, state, farmer_name } = body
  const updated_at_client = body.updated_at_client ?? null

  if (!name || !city || !state || !farmer_name) {
    return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
  }

  // [LWW] Server vence se foi modificado depois que cliente fez a alteracao
  if (updated_at_client) {
    const { data: current } = await supabase
      .from('farms').select('*').eq('id', id).maybeSingle()
    if (current && current.updated_at && current.updated_at > updated_at_client) {
      return NextResponse.json(current, {
        status: 200,
        headers: { 'X-Conflict-Resolution': 'server-wins' },
      })
    }
  }

  const { data, error } = await supabase
    .from('farms')
    .update({
      name, city, state: state.toUpperCase(), farmer_name,
      updated_at_client: updated_at_client || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'farm.delete')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  // Conta transações existentes (deleção da fazenda apaga tudo em cascata)
  const { count: txCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', id)

  const transactionCount = txCount ?? 0

  // Requer confirmação explícita quando há histórico
  const { searchParams } = new URL(req.url)
  if (transactionCount > 0 && searchParams.get('confirm') !== 'true') {
    return NextResponse.json(
      {
        error: `Esta fazenda possui ${transactionCount} transação(ões) no histórico. ` +
               `Todas serão excluídas permanentemente junto com insumos e talhões. ` +
               `Repita a requisição com ?confirm=true para confirmar.`,
        transactionCount,
        requiresConfirmation: true,
      },
      { status: 409 }
    )
  }

  const { data: snap } = await supabase
    .from('farms')
    .select('name, city, state')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('farms').delete().eq('id', id)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })

  await logAudit(supabase, session, {
    action: 'delete',
    entity: 'farm',
    entity_id: id,
    summary: snap
      ? `Excluiu fazenda "${snap.name}" (${snap.city}, ${snap.state}) — ${transactionCount} transação(ões) removidas em cascata`
      : `Excluiu fazenda`,
    changes: snap ? { before: { ...snap, deletedTransactions: transactionCount } } : { deletedTransactions: transactionCount },
  })

  return NextResponse.json({
    ok: true,
    ...(transactionCount > 0 && { deletedTransactions: transactionCount }),
  })
}
