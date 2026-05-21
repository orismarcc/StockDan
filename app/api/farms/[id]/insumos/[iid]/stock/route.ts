import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, iid: insumo_id } = await params
  const body = await req.json()
  const { quantity, date, notes } = body

  if (!quantity || Number(quantity) <= 0 || !date) {
    return NextResponse.json({ error: 'Quantidade e data são obrigatórias.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: insumo, error: fetchErr } = await supabase
    .from('insumos')
    .select('quantity, farm_id')
    .eq('id', insumo_id)
    .single()

  if (fetchErr || !insumo) {
    return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })
  }

  // Garante que o insumo pertence à fazenda do parâmetro da rota
  if (insumo.farm_id !== farm_id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const newQty = Number(insumo.quantity) + Number(quantity)

  const { error: updateErr } = await supabase
    .from('insumos')
    .update({ quantity: newQty })
    .eq('id', insumo_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      farm_id,
      insumo_id,
      user_id: session.id,
      type: 'entrada',
      quantity: Number(quantity),
      date,
      notes: notes || null,
    })
    .select()
    .single()

  if (txErr) {
    // Compensação: reverte estoque se a transação falhou ao persistir
    await supabase.from('insumos').update({ quantity: insumo.quantity }).eq('id', insumo_id)
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: newQty }, { status: 201 })
}
