import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  // Reivindicar uma fazenda órfã é prerrogativa do Gestor (assume responsabilidade)
  if (session.role !== 'gestor') {
    return NextResponse.json({ error: 'Apenas Gestor pode reivindicar fazenda.' }, { status: 403 })
  }

  const { id: farmId } = await params
  const supabase = createServerClient()

  // Só pode reivindicar fazendas sem dono (owner_id IS NULL)
  const { data: farm } = await supabase
    .from('farms')
    .select('id, owner_id')
    .eq('id', farmId)
    .single()

  if (!farm) return NextResponse.json({ error: 'Fazenda não encontrada.' }, { status: 404 })
  if (farm.owner_id !== null) {
    return NextResponse.json({ error: 'Esta fazenda já possui um responsável.' }, { status: 409 })
  }

  const { error } = await supabase
    .from('farms')
    .update({ owner_id: session.id })
    .eq('id', farmId)

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
