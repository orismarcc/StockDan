import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'

type Params = { params: Promise<{ id: string }> }

const DEFAULT_LIMIT = 50
const MAX_LIMIT     = 200

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const insumoId = searchParams.get('insumo_id')

  // Paginação: page (0-indexed) + limit
  const page  = Math.max(0, parseInt(searchParams.get('page')  ?? '0', 10) || 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
  const from  = page * limit
  const to    = from + limit - 1

  let query = supabase
    .from('transactions')
    .select('*, insumos(title, unit), talhoes(id, name), users(name)', { count: 'exact' })
    .eq('farm_id', farm_id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (insumoId) query = query.eq('insumo_id', insumoId)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })

  const headers = new Headers({ 'X-Total-Count': String(count ?? 0) })
  return NextResponse.json(data, { headers })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { insumo_id, talhao_id, quantity, date, notes, area_ha } = body

  if (!insumo_id || !talhao_id || !quantity || !date) {
    return NextResponse.json({ error: 'Insumo, talhão, quantidade e data são obrigatórios.' }, { status: 400 })
  }
  if (Number(quantity) <= 0) {
    return NextResponse.json({ error: 'Quantidade deve ser maior que zero.' }, { status: 400 })
  }

  // RPC atômica: UPDATE insumos + INSERT transactions em uma transação PostgreSQL
  const { data: rpc, error } = await supabase.rpc('registrar_saida', {
    p_farm_id:   farm_id,
    p_insumo_id: insumo_id,
    p_talhao_id: talhao_id,
    p_user_id:   session.id,
    p_quantity:  Number(quantity),
    p_date:      date,
    p_notes:     notes || null,
    p_area_ha:   area_ha != null && Number(area_ha) > 0 ? Number(area_ha) : null,
  })

  if (error) {
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  const { transaction_id, new_quantity } = rpc as { transaction_id: string; new_quantity: number }

  // Busca transaction com joins para o response (display only — escrita já é atômica)
  const { data: tx } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .eq('id', transaction_id)
    .single()

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: new_quantity }, { status: 201 })
}
