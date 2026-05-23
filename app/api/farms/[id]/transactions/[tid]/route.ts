import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'
import { isValidDate, isValidQuantity, isValidAreaHa, withinLength, trimField } from '@/lib/validate'

type Params = { params: Promise<{ id: string; tid: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { quantity, date, talhao_id, area_ha } = body
  const notes = trimField(body.notes)

  // ── Atualização de área aplicada (qualquer usuário com acesso à fazenda) ────
  // Não toca no estoque — sem necessidade de RPC.
  if (area_ha !== undefined && quantity === undefined && date === undefined) {
    if (!isValidAreaHa(area_ha)) {
      return NextResponse.json({ error: 'Área deve ser maior que zero (máx. 9.999.999 ha).' }, { status: 400 })
    }

    const { error } = await supabase
      .from('transactions')
      .update({ area_ha: area_ha })
      .eq('id', tid)
      .eq('farm_id', farm_id)

    if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Edição completa (quantidade / data / talhão) — somente admin ──────────
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  if (!quantity || !date) {
    return NextResponse.json({ error: 'Quantidade e data são obrigatórios.' }, { status: 400 })
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

  // RPC atômica: ajusta estoque + atualiza transaction em uma transação PostgreSQL
  const { data: rpc, error } = await supabase.rpc('editar_transacao', {
    p_tid:       tid,
    p_farm_id:   farm_id,
    p_quantity:  Number(quantity),
    p_date:      date,
    p_talhao_id: talhao_id || null,
    p_notes:     notes ?? null,
  })

  if (error) {
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  const { transaction_id } = rpc as { transaction_id: string; new_quantity: number }

  // Busca transaction atualizada com joins para o response
  const { data: updated } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .eq('id', transaction_id)
    .single()

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

  // RPC atômica: restaura estoque + deleta transaction em uma transação PostgreSQL
  const { error } = await supabase.rpc('excluir_transacao', {
    p_tid:     tid,
    p_farm_id: farm_id,
  })

  if (error) {
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}
