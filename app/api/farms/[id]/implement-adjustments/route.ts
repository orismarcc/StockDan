import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { isUUID } from '@/lib/validate'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
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
  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
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
  const offline_id        = body.offline_id ?? null
  const updated_at_client = body.updated_at_client ?? null

  if (offline_id !== null && !isUUID(offline_id)) {
    return NextResponse.json({ error: 'offline_id inválido.' }, { status: 400 })
  }

  if (!talhao_id) {
    return NextResponse.json({ error: 'Talhão é obrigatório.' }, { status: 400 })
  }

  // [IDEMPOTENCY] Se offline_id ja foi processado, retorna o existente
  if (offline_id) {
    const { data: existing } = await supabase
      .from('implement_adjustments')
      .select('*, users(name)')
      .eq('offline_id', offline_id)
      .eq('farm_id', farm_id)
      .maybeSingle()

    if (existing) return NextResponse.json(existing, { status: 201 })
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
      offline_id: offline_id || null,
      updated_at_client: updated_at_client || null,
    })
    .select('*, users(name)')
    .single()

  if (error) {
    // Race condition: outro request com mesmo offline_id chegou primeiro
    // (codigo 23505 = unique_violation). Trata como sucesso idempotente.
    if (offline_id && (error as { code?: string }).code === '23505') {
      const { data: existing } = await supabase
        .from('implement_adjustments')
        .select('*, users(name)')
        .eq('offline_id', offline_id)
        .eq('farm_id', farm_id)
        .maybeSingle()
      if (existing) return NextResponse.json(existing, { status: 201 })
    }
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
