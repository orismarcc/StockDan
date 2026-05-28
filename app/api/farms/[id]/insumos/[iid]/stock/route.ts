import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { can } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'
import { isUUID, parseClientTimestamp } from '@/lib/validate'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'transaction.entrada')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { id: farm_id, iid: insumo_id } = await params
  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { quantity, date, notes } = body
  const offline_id        = body.offline_id ?? null
  const created_at_client = parseClientTimestamp(body.created_at_client)

  if (offline_id !== null && !isUUID(offline_id)) {
    return NextResponse.json({ error: 'offline_id inválido.' }, { status: 400 })
  }

  if (!quantity || Number(quantity) <= 0 || !date) {
    return NextResponse.json({ error: 'Quantidade e data são obrigatórias.' }, { status: 400 })
  }

  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  // RPC atômica: UPDATE insumos + INSERT transactions em uma transação PostgreSQL
  // p_offline_id garante idempotencia em retry de timeout (mesmo pattern de registrar_saida)
  const { data: rpc, error } = await supabase.rpc('registrar_entrada', {
    p_farm_id:    farm_id,
    p_insumo_id:  insumo_id,
    p_user_id:    session.id,
    p_quantity:   Number(quantity),
    p_date:       date,
    p_notes:      notes || null,
    p_offline_id: offline_id,
    ...(created_at_client ? { p_created_at: created_at_client } : {}),
  })

  if (error) {
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  const { transaction_id, new_quantity } = rpc as { transaction_id: string; new_quantity: number }

  // Busca transaction com joins para o response (apenas para display — a escrita já é atômica)
  const { data: tx } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit), users(name)')
    .eq('id', transaction_id)
    .single()

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: new_quantity }, { status: 201 })
}
