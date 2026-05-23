import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, iid: insumo_id } = await params
  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { quantity, date, notes } = body

  if (!quantity || Number(quantity) <= 0 || !date) {
    return NextResponse.json({ error: 'Quantidade e data são obrigatórias.' }, { status: 400 })
  }

  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  // RPC atômica: UPDATE insumos + INSERT transactions em uma transação PostgreSQL
  const { data: rpc, error } = await supabase.rpc('registrar_entrada', {
    p_farm_id:   farm_id,
    p_insumo_id: insumo_id,
    p_user_id:   session.id,
    p_quantity:  Number(quantity),
    p_date:      date,
    p_notes:     notes || null,
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
