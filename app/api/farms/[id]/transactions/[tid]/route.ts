import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { can } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'
import { isValidDate, isValidQuantity, isValidAreaHa, withinLength, trimField } from '@/lib/validate'

type Params = { params: Promise<{ id: string; tid: string }> }

/** Helper LWW: compara updated_at_client com server.updated_at. Retorna a
 *  Response 200 com header X-Conflict-Resolution se o cliente perdeu. */
async function checkLwwConflict(
  supabase: ReturnType<typeof createServerClient>,
  tid: string,
  farm_id: string,
  updated_at_client: string | null
): Promise<Response | null> {
  if (!updated_at_client) return null
  const { data: current } = await supabase
    .from('transactions')
    .select('*, insumos(title, unit), talhoes(id, name), users(name)')
    .eq('id', tid)
    .eq('farm_id', farm_id)
    .maybeSingle()
  if (current && current.updated_at && current.updated_at > updated_at_client) {
    return NextResponse.json(current, {
      status: 200,
      headers: { 'X-Conflict-Resolution': 'server-wins' },
    })
  }
  return null
}

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
  const updated_at_client = body.updated_at_client ?? null

  // ── Atualização de área aplicada ─────────────────────────────────────────────
  // Decisão de design consciente: qualquer usuário com acesso à fazenda pode
  // registrar a área aplicada de uma retirada (sem tocar no estoque).
  // Operário registra a área no campo após aplicar — faz sentido operacionalmente.
  // Não há RPC pois não há efeito colateral em estoque.
  // Documentado como 'transaction.area_ha.edit' (implícito em 'transaction.saida').
  if (area_ha !== undefined && quantity === undefined && date === undefined) {
    if (!isValidAreaHa(area_ha)) {
      return NextResponse.json({ error: 'Área deve ser maior que zero (máx. 9.999.999 ha).' }, { status: 400 })
    }

    // [LWW] Cliente perdeu? Retorna estado atual sem aplicar
    const conflict = await checkLwwConflict(supabase, tid, farm_id, updated_at_client)
    if (conflict) return conflict

    const { error } = await supabase
      .from('transactions')
      .update({
        area_ha: area_ha,
        updated_at_client: updated_at_client || null,
      })
      .eq('id', tid)
      .eq('farm_id', farm_id)

    if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Edição completa (quantidade / data / talhão) — só quem pode editar ────
  if (!can(session.role, 'transaction.edit')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
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

  // [LWW] Check antes da RPC (nao-atomico mas suficiente — RPC ja serializa via FOR UPDATE)
  const conflict = await checkLwwConflict(supabase, tid, farm_id, updated_at_client)
  if (conflict) return conflict

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

  // Persiste updated_at_client separadamente (RPC nao recebe esse campo)
  if (updated_at_client) {
    await supabase
      .from('transactions')
      .update({ updated_at_client })
      .eq('id', transaction_id)
  }

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
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  // P9: exclusão de transação restrita a Gestor/Admin (audita histórico)
  if (!can(session.role, 'transaction.delete')) {
    return NextResponse.json({ error: 'Sem permissão para excluir transação.' }, { status: 403 })
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
    // [IDEMPOTENT-DELETE] Se transacao ja foi deletada (PGRST116 ou similar),
    // tratamos como sucesso para retry offline
    const code = (error as { code?: string }).code
    if (code === 'PGRST116' || code === '23503') {
      return NextResponse.json({ ok: true, already_deleted: true })
    }
    const { status, message } = parseRpcError(error)
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}
