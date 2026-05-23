import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
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
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, iid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, min_quantity, quantity, adjustment_notes } = body

  // ── Quantity adjustment: optimistic lock + audit trail ─────────────────────
  if (quantity !== undefined) {
    const { data: current } = await supabase
      .from('insumos')
      .select('quantity')
      .eq('id', iid)
      .eq('farm_id', farm_id)
      .single()

    if (!current) return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })

    const oldQty = Number(current.quantity)
    const newQty = Number(quantity)

    if (newQty < 0) return NextResponse.json({ error: 'Estoque não pode ser negativo.' }, { status: 400 })

    const { data, error } = await supabase
      .from('insumos')
      .update({ quantity: newQty })
      .eq('id', iid)
      .eq('farm_id', farm_id)
      .eq('quantity', oldQty)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Estoque modificado simultaneamente. Tente novamente.' }, { status: 422 })

    const delta = newQty - oldQty
    if (Math.abs(delta) > 0.0001) {
      await supabase.from('transactions').insert({
        farm_id,
        insumo_id: iid,
        user_id: session.id,
        type: delta > 0 ? 'entrada' : 'saida',
        quantity: Math.abs(delta),
        date: new Date().toISOString().split('T')[0],
        notes: `Ajuste manual${adjustment_notes ? ': ' + adjustment_notes : ''}`,
      })
    }

    return NextResponse.json(data)
  }

  // ── Metadata update (title, description, min_quantity) ─────────────────────
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession()
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
