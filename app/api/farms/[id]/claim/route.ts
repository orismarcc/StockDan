import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
