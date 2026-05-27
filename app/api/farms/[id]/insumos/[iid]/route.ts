import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'
import { trimField, isValidQuantity, withinLength } from '@/lib/validate'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id, iid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('insumos')
    .select('*')
    .eq('id', iid)
    .eq('farm_id', farm_id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, iid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  const { title, description, min_quantity, quantity, adjustment_notes } = body
  const updated_at_client = body.updated_at_client ?? null

  // [LWW] aplica em metadata updates (nao em ajustar_estoque, que e atomico via RPC)
  if (updated_at_client && quantity === undefined) {
    const { data: current } = await supabase
      .from('insumos').select('*').eq('id', iid).eq('farm_id', farm_id).maybeSingle()
    if (current && current.updated_at && current.updated_at > updated_at_client) {
      return NextResponse.json(current, {
        status: 200,
        headers: { 'X-Conflict-Resolution': 'server-wins' },
      })
    }
  }

  // ── Ajuste de quantidade: RPC atômica ──────────────────────────────────────
  if (quantity !== undefined) {
    const newQty = Number(quantity)
    if (!Number.isFinite(newQty) || newQty < 0 || newQty > 9_999_999) {
      return NextResponse.json({ error: 'Estoque inválido (deve ser ≥ 0 e ≤ 9.999.999).' }, { status: 400 })
    }

    const { data: rpc, error } = await supabase.rpc('ajustar_estoque', {
      p_insumo_id: iid,
      p_farm_id:   farm_id,
      p_user_id:   session.id,
      p_new_qty:   newQty,
      p_notes:     adjustment_notes || null,
    })

    if (error) {
      const { status, message } = parseRpcError(error)
      return NextResponse.json({ error: message }, { status })
    }

    // Retorna o insumo atualizado
    const { data } = await supabase
      .from('insumos')
      .select('*')
      .eq('id', iid)
      .single()

    return NextResponse.json(data)
  }

  // ── Atualização de metadados (title, description, min_quantity) ────────────
  const updateData: Record<string, unknown> = {}
  if (title !== undefined) {
    const t = trimField(title)
    if (!t) return NextResponse.json({ error: 'Nome do insumo não pode ser vazio.' }, { status: 400 })
    if (!withinLength(t, 120)) return NextResponse.json({ error: 'Nome excede 120 caracteres.' }, { status: 400 })
    updateData.title = t
  }
  if (description !== undefined) updateData.description = trimField(description)
  if (min_quantity !== undefined) {
    const mq = min_quantity != null ? Number(min_quantity) : null
    if (mq !== null && (!Number.isFinite(mq) || mq < 0 || mq > 9_999_999)) {
      return NextResponse.json({ error: 'Estoque mínimo inválido.' }, { status: 400 })
    }
    updateData.min_quantity = mq
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  if (updated_at_client) updateData.updated_at_client = updated_at_client

  const { data, error } = await supabase
    .from('insumos')
    .update(updateData)
    .eq('id', iid)
    .eq('farm_id', farm_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, iid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('insumos')
    .delete()
    .eq('id', iid)
    .eq('farm_id', farm_id)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
