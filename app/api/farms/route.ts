import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { trimField, withinLength } from '@/lib/validate'
import { withAuth } from '@/lib/withAuth'

export const GET = withAuth(async (_req, session) => {
  const supabase = createServerClient()

  if (session.role === 'gestor') {
    // Gestor: suas próprias fazendas (owner_id = self)
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .eq('owner_id', session.id)
      .order('name')

    if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    return NextResponse.json(data)
  }

  // Admin / Agrônomo / Operário: apenas fazendas vinculadas via farm_users
  // (com proteção de tenant — owner_id precisa ser o Gestor do tenant)
  const { data, error } = await supabase
    .from('farm_users')
    .select('farms!inner(*)')
    .eq('user_id', session.id)
    .eq('farms.owner_id', session.gestor_id)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json((data as any[]).map((r) => r.farms))
})

export const POST = withAuth(async (req, session) => {
  if (!can(session.role, 'farm.create')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const body = await parseBody<{ name?: string; city?: string; state?: string; farmer_name?: string }>(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const name        = trimField(body.name)
  const city        = trimField(body.city)
  const state       = trimField(body.state)
  const farmer_name = trimField(body.farmer_name)

  if (!name || !city || !state || !farmer_name) {
    return NextResponse.json({ error: 'Preencha todos os campos obrigatórios.' }, { status: 400 })
  }
  if (!withinLength(name, 120) || !withinLength(city, 80) || !withinLength(farmer_name, 120)) {
    return NextResponse.json({ error: 'Campo excede o tamanho máximo permitido.' }, { status: 400 })
  }
  if (state.length !== 2) {
    return NextResponse.json({ error: 'Estado deve ter 2 letras (ex: SP).' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('farms')
    // P8: owner_id é sempre o Gestor do tenant (mesmo se Admin está criando)
    .insert({ name, city, state: state.toUpperCase().slice(0, 2), farmer_name, owner_id: session.gestor_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
})
