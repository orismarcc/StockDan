import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'

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

  const { data: insumo, error: fetchErr } = await supabase
    .from('insumos')
    .select('quantity, farm_id')
    .eq('id', insumo_id)
    .eq('farm_id', farm_id)
    .single()

  if (fetchErr || !insumo) {
    return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })
  }

  const newQty = Number(insumo.quantity) + Number(quantity)

  const { data: updated, error: updateErr } = await supabase
    .from('insumos')
    .update({ quantity: newQty })
    .eq('id', insumo_id)
    .eq('quantity', Number(insumo.quantity))
    .select('quantity')

  if (updateErr) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Estoque modificado simultaneamente. Tente novamente.' }, { status: 422 })
  }

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
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, transaction: tx, newQuantity: newQty }, { status: 201 })
}
