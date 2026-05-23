import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('insumos')
    .select('*')
    .eq('farm_id', farm_id)
    .order('title')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, unit, quantity, min_quantity, date } = body

  if (!title || !unit || quantity === undefined || !date) {
    return NextResponse.json({ error: 'Preencha os campos obrigatórios.' }, { status: 400 })
  }
  if (unit !== 'kg') {
    return NextResponse.json({ error: 'Unidade inválida. Use kg.' }, { status: 400 })
  }

  const { data: insumo, error: insError } = await supabase
    .from('insumos')
    .insert({
      farm_id,
      title,
      description: description || null,
      unit,
      quantity: Number(quantity),
      min_quantity: min_quantity ? Number(min_quantity) : null,
    })
    .select()
    .single()

  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  if (Number(quantity) > 0) {
    await supabase.from('transactions').insert({
      farm_id,
      insumo_id: insumo.id,
      user_id: session.id,
      type: 'entrada',
      quantity: Number(quantity),
      date,
      notes: 'Estoque inicial',
    })
  }

  return NextResponse.json(insumo, { status: 201 })
}
