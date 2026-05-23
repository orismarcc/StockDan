import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { parseRpcError } from '@/lib/rpcErrors'

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

  // ── Ajuste de quantidade: RPC atômica ──────────────────────────────────────
  if (quantity !== undefined) {
    const newQty = Number(quantity)
    if (newQty < 0) {
      return NextResponse.json({ error: 'Estoque não pode ser negativo.' }, { status: 400 })
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
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description || null
  if (min_quantity !== undefined) updateData.min_quantity = min_quantity != null ? Number(min_quantity) : null

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

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
