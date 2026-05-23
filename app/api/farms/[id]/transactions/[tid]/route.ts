import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'

type Params = { params: Promise<{ id: string; tid: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { quantity, date, talhao_id, notes, area_ha } = body

  // ── Atualização de área aplicada ──────────────────────────────────────────
  // Qualquer usuário com acesso à fazenda pode registrar a área.
  // Não toca no estoque.
  if (area_ha !== undefined && quantity === undefined && date === undefined) {
    const ha = Number(area_ha)
    if (isNaN(ha) || ha <= 0) {
      return NextResponse.json({ error: 'Área deve ser maior que zero.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('transactions')
      .update({ area_ha: ha })
      .eq('id', tid)
      .eq('farm_id', farm_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Edição completa (quantidade / data / talhão) — somente admin ──────────
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  if (!quantity || Number(quantity) <= 0 || !date) {
    return NextResponse.json({ error: 'Quantidade e data são obrigatórios.' }, { status: 400 })
  }

  const { data: tx } = await supabase
    .from('transactions')
    .select('id, type, quantity, insumo_id, talhao_id, farm_id')
    .eq('id', tid)
    .eq('farm_id', farm_id)
    .single()

  if (!tx) return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 })

  const { data: insumo } = await supabase
    .from('insumos')
    .select('quantity')
    .eq('id', tx.insumo_id)
    .single()

  if (!insumo) return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })

  const origQty = Number(tx.quantity)
  const newQty = Number(quantity)
  const currentStock = Number(insumo.quantity)

  const newStock = tx.type === 'saida'
    ? currentStock + origQty - newQty
    : currentStock - origQty + newQty

  if (newStock < 0) {
    return NextResponse.json(
      { error: `Estoque insuficiente para esta edição. Disponível: ${currentStock}` },
      { status: 422 }
    )
  }

  const { data: stockUpdated, error: stockErr } = await supabase
    .from('insumos')
    .update({ quantity: newStock })
    .eq('id', tx.insumo_id)
    .eq('quantity', currentStock)
    .select('quantity')

  if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 })
  if (!stockUpdated || stockUpdated.length === 0) {
    return NextResponse.json({ error: 'Estoque modificado simultaneamente. Tente novamente.' }, { status: 422 })
  }

  const { data: updated, error: txErr } = await supabase
    .from('transactions')
    .update({ quantity: newQty, date, talhao_id: talhao_id || tx.talhao_id, notes: notes ?? null })
    .eq('id', tid)
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .single()

  if (txErr) {
    await supabase.from('insumos').update({ quantity: currentStock }).eq('id', tx.insumo_id)
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, transaction: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data: tx } = await supabase
    .from('transactions')
    .select('id, type, quantity, insumo_id, farm_id')
    .eq('id', tid)
    .eq('farm_id', farm_id)
    .single()

  if (!tx) return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 })

  const { data: insumo } = await supabase
    .from('insumos')
    .select('quantity')
    .eq('id', tx.insumo_id)
    .single()

  if (!insumo) return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })

  const origQty = Number(tx.quantity)
  const currentStock = Number(insumo.quantity)
  const restoredStock = tx.type === 'saida' ? currentStock + origQty : currentStock - origQty

  if (restoredStock < 0) {
    return NextResponse.json({ error: 'Não é possível excluir: estoque ficaria negativo.' }, { status: 422 })
  }

  const { data: stockUpdated, error: stockErr } = await supabase
    .from('insumos')
    .update({ quantity: restoredStock })
    .eq('id', tx.insumo_id)
    .eq('quantity', currentStock)
    .select('quantity')

  if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 })
  if (!stockUpdated || stockUpdated.length === 0) {
    return NextResponse.json({ error: 'Estoque modificado simultaneamente. Tente novamente.' }, { status: 422 })
  }

  const { error: delErr } = await supabase.from('transactions').delete().eq('id', tid)

  if (delErr) {
    await supabase.from('insumos').update({ quantity: currentStock }).eq('id', tx.insumo_id)
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
