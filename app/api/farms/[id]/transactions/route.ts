import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'
import { isValidDate, isValidQuantity, isUUID, withinLength, trimField, parseClientTimestamp } from '@/lib/validate'
import { notifyNovaAplicacao, notifyEstoqueCritico } from '@/lib/notifications'

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

  const headers = new Headers({
    'X-Total-Count': String(count ?? 0),
    'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
  })
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
  const { insumo_id, talhao_id, quantity, date, area_ha } = body
  const notes      = trimField(body.notes)       // strip leading/trailing whitespace
  const offline_id = body.offline_id ?? null

  // Timestamp do cliente: preserva a hora real do registro offline.
  // Aceito apenas se for ISO válido e dentro de uma janela razoável
  // (últimos 7 dias até +1 min), para evitar manipulação de histórico.
  const created_at_client = parseClientTimestamp(body.created_at_client)

  // Validate offline_id format to prevent crafted idempotency keys
  if (offline_id !== null && !isUUID(offline_id)) {
    return NextResponse.json({ error: 'offline_id inválido.' }, { status: 400 })
  }

  // [OFFLINE-1] Idempotency: se offline_id já foi processado, retorna a transação existente
  if (offline_id) {
    const { data: existing } = await supabase
      .from('transactions')
      .select('*, insumos(title, unit), talhoes(id, name), users(name)')
      .eq('offline_id', offline_id)
      .eq('farm_id', farm_id)
      .maybeSingle()

    if (existing) {
      const { data: currentInsumo } = await supabase
        .from('insumos').select('quantity').eq('id', existing.insumo_id).single()
      return NextResponse.json(
        { ok: true, transaction: existing, newQuantity: currentInsumo?.quantity ?? 0 },
        { status: 201 }
      )
    }
  }

  if (!insumo_id || !talhao_id || !quantity || !date) {
    return NextResponse.json({ error: 'Insumo, talhão, quantidade e data são obrigatórios.' }, { status: 400 })
  }
  if (!isValidQuantity(quantity)) {
    return NextResponse.json({ error: 'Quantidade inválida (deve ser > 0 e ≤ 9.999.999).' }, { status: 400 })
  }
  if (!isValidDate(date)) {
    return NextResponse.json({ error: 'Data inválida. Use o formato AAAA-MM-DD.' }, { status: 400 })
  }
  if (notes && !withinLength(notes, 1000)) {
    return NextResponse.json({ error: 'Observação excede 1.000 caracteres.' }, { status: 400 })
  }

  // RPC atômica: UPDATE insumos + INSERT transactions em uma transação PostgreSQL
  const { data: rpc, error } = await supabase.rpc('registrar_saida', {
    p_farm_id:    farm_id,
    p_insumo_id:  insumo_id,
    p_talhao_id:  talhao_id,
    p_user_id:    session.id,
    p_quantity:   Number(quantity),
    p_date:       date,
    p_notes:      notes || null,
    p_area_ha:    area_ha != null && Number(area_ha) > 0 ? Number(area_ha) : null,
    p_offline_id: (offline_id && typeof offline_id === 'string') ? offline_id : null,
    // Se o cliente enviou timestamp válido, usa; caso contrário a RPC usa NOW()
    ...(created_at_client ? { p_created_at: created_at_client } : {}),
  })

  if (error) {
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  const { transaction_id, new_quantity } = rpc as { transaction_id: string; new_quantity: number }

  // Busca transaction com joins para o response (display only — escrita já é atômica)
  const { data: tx } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit, min_quantity), talhoes(id, name), users(name), farms(name)')
    .eq('id', transaction_id)
    .single()

  // Fire-and-forget: notificações não bloqueiam o response (P11)
  if (tx) {
    const insumo = tx.insumos as { title: string; unit: string; min_quantity: number | null } | null
    const talhao = tx.talhoes as { id: string; name: string } | null
    const user   = tx.users   as { name: string } | null
    const farm   = tx.farms   as { name: string } | null

    void notifyNovaAplicacao({
      gestorId:    session.gestor_id,
      userName:    user?.name    ?? 'Usuário',
      insumoTitle: insumo?.title ?? 'Insumo',
      talhaoName:  talhao?.name  ?? 'Talhão',
      quantity:    Number(quantity),
      unit:        insumo?.unit  ?? 'kg',
    })

    if (insumo?.min_quantity != null && new_quantity < insumo.min_quantity) {
      void notifyEstoqueCritico({
        gestorId:    session.gestor_id,
        farmName:    farm?.name    ?? 'Fazenda',
        insumoTitle: insumo.title,
        currentQty:  new_quantity,
        minQty:      insumo.min_quantity,
        unit:        insumo.unit,
      })
    }
  }

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: new_quantity }, { status: 201 })
}
