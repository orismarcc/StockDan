import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'

type Params = { params: Promise<{ id: string }> }

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

  let query = supabase
    .from('transactions')
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .eq('farm_id', farm_id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (insumoId) query = query.eq('insumo_id', insumoId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { insumo_id, talhao_id, quantity, date, notes, area_ha } = body

  if (!insumo_id || !talhao_id || !quantity || !date) {
    return NextResponse.json({ error: 'Insumo, talhão, quantidade e data são obrigatórios.' }, { status: 400 })
  }
  if (Number(quantity) <= 0) {
    return NextResponse.json({ error: 'Quantidade deve ser maior que zero.' }, { status: 400 })
  }

  // Verifica insumo e estoque
  const { data: insumo } = await supabase
    .from('insumos')
    .select('quantity, farm_id')
    .eq('id', insumo_id)
    .single()

  if (!insumo) return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })
  if (insumo.farm_id !== farm_id) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

  // Valida que o talhão pertence à fazenda
  const { data: talhao } = await supabase
    .from('talhoes')
    .select('id')
    .eq('id', talhao_id)
    .eq('farm_id', farm_id)
    .single()

  if (!talhao) return NextResponse.json({ error: 'Talhão não encontrado nesta fazenda.' }, { status: 404 })

  if (Number(insumo.quantity) < Number(quantity)) {
    return NextResponse.json(
      { error: `Estoque insuficiente. Disponível: ${insumo.quantity}` },
      { status: 422 }
    )
  }

  const newQty = Number(insumo.quantity) - Number(quantity)

  // Atualiza estoque com optimistic lock: só atualiza se quantity não mudou desde a leitura
  const { data: updated, error: updateErr } = await supabase
    .from('insumos')
    .update({ quantity: newQty })
    .eq('id', insumo_id)
    .eq('quantity', Number(insumo.quantity))
    .select('quantity')

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Estoque modificado simultaneamente. Tente novamente.' },
      { status: 422 }
    )
  }

  // Registra transação
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      farm_id,
      insumo_id,
      talhao_id,
      user_id: session.id,
      type: 'saida',
      quantity: Number(quantity),
      date,
      notes: notes || null,
      area_ha: area_ha != null && Number(area_ha) > 0 ? Number(area_ha) : null,
    })
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .single()

  if (txErr) {
    // Compensação: reverte estoque se a transação falhou ao persistir
    await supabase.from('insumos').update({ quantity: insumo.quantity }).eq('id', insumo_id)
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: newQty }, { status: 201 })
}
