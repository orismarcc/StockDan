import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { iid } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('insumos')
    .select('*')
    .eq('id', iid)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Insumo não encontrado.' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { iid } = await params
  const body = await req.json()
  const { title, description, min_quantity, quantity } = body

  const updateData: Record<string, any> = {
    title,
    description: description || null,
    min_quantity: min_quantity != null ? Number(min_quantity) : null,
  }
  if (quantity != null) updateData.quantity = Number(quantity)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('insumos')
    .update(updateData)
    .eq('id', iid)
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

  const { iid } = await params
  const supabase = createServerClient()
  const { error } = await supabase.from('insumos').delete().eq('id', iid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
