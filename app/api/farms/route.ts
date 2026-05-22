import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const supabase = createServerClient()

  if (session.role === 'admin') {
    // Admins veem apenas suas próprias fazendas
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .eq('owner_id', session.id)
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Operário: apenas fazendas vinculadas
  const { data, error } = await supabase
    .from('farm_users')
    .select('farms(*)')
    .eq('user_id', session.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data.map((r: any) => r.farms))
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { name, city, state, farmer_name } = body

  if (!name || !city || !state || !farmer_name) {
    return NextResponse.json({ error: 'Preencha todos os campos obrigatórios.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('farms')
    .insert({ name, city, state: state.toUpperCase(), farmer_name, owner_id: session.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
