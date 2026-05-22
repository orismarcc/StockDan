import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const talhaoId = searchParams.get('talhao_id')

  let query = supabase
    .from('implement_adjustments')
    .select('*, users(name)')
    .eq('farm_id', farm_id)
    .order('created_at', { ascending: false })

  if (talhaoId) query = query.eq('talhao_id', talhaoId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const {
    talhao_id,
    implemento,
    taxa_kgha,
    palhetas,
    rpm_maquina,
    rpm_pratos_eixo,
    num_bandejas,
    espacamento_bandejas,
    cv_percent,
    faixa_aplicacao,
    comporta,
  } = body

  if (!talhao_id) {
    return NextResponse.json({ error: 'Talhão é obrigatório.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('implement_adjustments')
    .insert({
      farm_id,
      talhao_id,
      user_id: session.id,
      implemento: implemento || null,
      taxa_kgha: taxa_kgha ? Number(taxa_kgha) : null,
      palhetas: palhetas || null,
      rpm_maquina: rpm_maquina ? Number(rpm_maquina) : null,
      rpm_pratos_eixo: rpm_pratos_eixo ? Number(rpm_pratos_eixo) : null,
      num_bandejas: num_bandejas ? Number(num_bandejas) : null,
      espacamento_bandejas: espacamento_bandejas || null,
      cv_percent: cv_percent ? Number(cv_percent) : null,
      faixa_aplicacao: faixa_aplicacao || null,
      comporta: comporta || null,
    })
    .select('*, users(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
