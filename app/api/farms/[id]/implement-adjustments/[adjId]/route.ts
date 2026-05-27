import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'

type Params = { params: Promise<{ id: string; adjId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id, adjId } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const {
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
  const updated_at_client = body.updated_at_client ?? null

  // [LWW] Se cliente envia updated_at_client e o registro foi modificado depois
  // por outro user, ignora silenciosamente (retorna o estado atual do servidor).
  // Evita que um PATCH offline antigo sobrescreva mudanca mais recente de outro user.
  if (updated_at_client) {
    const { data: current } = await supabase
      .from('implement_adjustments')
      .select('*, users(name)')
      .eq('id', adjId)
      .eq('farm_id', farm_id)
      .maybeSingle()

    if (current && current.updated_at && current.updated_at > updated_at_client) {
      // Cliente perdeu o conflito — retorna estado atual do servidor (200 OK,
      // mas sem ter aplicado a mudanca). Cliente deve reconciliar com este estado.
      return NextResponse.json(current, {
        status: 200,
        headers: { 'X-Conflict-Resolution': 'server-wins' },
      })
    }
  }

  const { data, error } = await supabase
    .from('implement_adjustments')
    .update({
      implemento:           implemento           || null,
      taxa_kgha:            taxa_kgha            ? Number(taxa_kgha)            : null,
      palhetas:             palhetas             || null,
      rpm_maquina:          rpm_maquina          ? Number(rpm_maquina)          : null,
      rpm_pratos_eixo:      rpm_pratos_eixo      ? Number(rpm_pratos_eixo)      : null,
      num_bandejas:         num_bandejas         ? Number(num_bandejas)         : null,
      espacamento_bandejas: espacamento_bandejas || null,
      cv_percent:           cv_percent           ? Number(cv_percent)           : null,
      faixa_aplicacao:      faixa_aplicacao      || null,
      comporta:             comporta             || null,
      updated_at_client:    updated_at_client    || null,
    })
    .eq('id', adjId)
    .eq('farm_id', farm_id)
    .select('*, users(name)')
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id, adjId } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('implement_adjustments')
    .delete()
    .eq('id', adjId)
    .eq('farm_id', farm_id)

  // [IDEMPOTENT-DELETE] Mesmo se registro ja foi deletado, retorna 200.
  // Cliente que retentou DELETE offline ve sucesso (nao falha) na segunda tentativa.
  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
