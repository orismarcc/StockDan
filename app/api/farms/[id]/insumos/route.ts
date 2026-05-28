import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { can } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'
import { trimField, isValidDate, isValidQuantity, withinLength } from '@/lib/validate'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('insumos')
    .select('*')
    .eq('farm_id', farm_id)
    .order('title')

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'insumo.write')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const title       = trimField(body.title)
  const description = trimField(body.description) // nullable
  const { unit, quantity, min_quantity, date } = body

  if (!title || !unit || quantity === undefined || !date) {
    return NextResponse.json({ error: 'Preencha os campos obrigatórios.' }, { status: 400 })
  }
  if (!withinLength(title, 120)) {
    return NextResponse.json({ error: 'Nome do insumo excede 120 caracteres.' }, { status: 400 })
  }
  if (unit !== 'kg') {
    return NextResponse.json({ error: 'Unidade inválida. Use kg.' }, { status: 400 })
  }
  if (!isValidQuantity(quantity) && Number(quantity) !== 0) {
    return NextResponse.json({ error: 'Quantidade inicial inválida (máx. 9.999.999 kg).' }, { status: 400 })
  }
  if (min_quantity !== undefined && min_quantity !== null && !isValidQuantity(min_quantity) && Number(min_quantity) !== 0) {
    return NextResponse.json({ error: 'Estoque mínimo inválido.' }, { status: 400 })
  }
  if (!isValidDate(date)) {
    return NextResponse.json({ error: 'Data inválida. Use o formato AAAA-MM-DD.' }, { status: 400 })
  }

  // RPC atômica: INSERT insumos + INSERT transactions (estoque inicial) em uma transação
  const { data: rpc, error } = await supabase.rpc('criar_insumo', {
    p_farm_id:      farm_id,
    p_user_id:      session.id,
    p_title:        title,
    p_description:  description,
    p_unit:         unit,
    p_quantity:     Number(quantity),
    p_min_quantity: min_quantity != null ? Number(min_quantity) : null,
    p_date:         date,
  })

  if (error) {
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json(rpc as object, { status: 201 })
}
