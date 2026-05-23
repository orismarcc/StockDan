import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { trimField, isValidAreaHa, withinLength } from '@/lib/validate'

type Params = { params: Promise<{ id: string; tid: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const name = trimField(body.name)
  if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!withinLength(name, 120)) return NextResponse.json({ error: 'Nome excede 120 caracteres.' }, { status: 400 })
  if (!isValidAreaHa(body.area_ha)) {
    return NextResponse.json({ error: 'Área deve ser maior que zero (máx. 9.999.999 ha).' }, { status: 400 })
  }
  const area_ha = Number(body.area_ha)

  const { data, error } = await supabase
    .from('talhoes')
    .update({ name, area_ha })
    .eq('id', tid)
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

  const { id: farm_id, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('talhoes')
    .delete()
    .eq('id', tid)
    .eq('farm_id', farm_id)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
