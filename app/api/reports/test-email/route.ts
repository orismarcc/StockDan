import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { buildReportEmail } from '@/lib/emailTemplate'
import { withAuth } from '@/lib/withAuth'
import { can } from '@/lib/permissions'

const FROM_EMAIL = 'StockDan <onboarding@resend.dev>'

/**
 * POST /api/reports/test-email
 *
 * Envia um email de teste imediatamente usando os dados reais do tenant.
 * Apenas gestores e admins podem usar. Não atualiza last_sent_at.
 * Útil para verificar o layout e conteúdo do email antes de ativar o agendamento.
 */
export const POST = withAuth(async (_req, session) => {
  if (!can(session.role, 'reports.schedule')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY não configurada.' }, { status: 500 })
  }

  const supabase = createServerClient()

  // Busca configuração de email do gestor
  const { data: sched } = await supabase
    .from('report_schedules')
    .select('email, window_days')
    .eq('gestor_id', session.gestor_id)
    .maybeSingle()

  const targetEmail  = sched?.email || session.email
  const windowDays   = sched?.window_days ?? 30

  // Fazendas
  const { data: farms } = await supabase
    .from('farms')
    .select('id, name, city, state, farmer_name')
    .eq('owner_id', session.gestor_id)
    .order('name')

  const farmIds = (farms ?? []).map(f => f.id)

  // Insumos
  const { data: allInsumos } = await supabase
    .from('insumos')
    .select('id, farm_id, title, unit, quantity, min_quantity')
    .in('farm_id', farmIds.length ? farmIds : ['00000000-0000-0000-0000-000000000000'])

  // Transações do período
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, farm_id, quantity, type')
    .in('farm_id', farmIds.length ? farmIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('date', windowStart.toISOString().split('T')[0])

  const insumosByFarm = new Map<string, typeof allInsumos>()
  for (const ins of allInsumos ?? []) {
    if (!insumosByFarm.has(ins.farm_id)) insumosByFarm.set(ins.farm_id, [])
    insumosByFarm.get(ins.farm_id)!.push(ins)
  }

  const txByFarm = new Map<string, { count: number; totalKg: number }>()
  for (const tx of transactions ?? []) {
    if (!txByFarm.has(tx.farm_id)) txByFarm.set(tx.farm_id, { count: 0, totalKg: 0 })
    const e = txByFarm.get(tx.farm_id)!
    e.count++
    if (tx.type === 'saida') e.totalKg += Number(tx.quantity)
  }

  const farmsData = (farms ?? []).map(f => ({
    id: f.id, name: f.name, city: f.city, state: f.state, farmer_name: f.farmer_name,
    insumos: (insumosByFarm.get(f.id) ?? []).map(i => ({
      title: i.title, unit: i.unit,
      quantity: Number(i.quantity),
      min_quantity: i.min_quantity != null ? Number(i.min_quantity) : null,
    })),
    txCount: txByFarm.get(f.id)?.count ?? 0,
    totalKg: txByFarm.get(f.id)?.totalKg ?? 0,
  }))

  const totalAlerts = farmsData.reduce((acc, farm) =>
    acc + farm.insumos.filter(i => i.quantity <= 0 || (i.min_quantity != null && i.quantity <= i.min_quantity)).length, 0)
  const totalTx = [...txByFarm.values()].reduce((a, b) => a + b.count, 0)

  const now = new Date()
  const generatedAt = now.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })

  const { subject, html } = buildReportEmail({
    gestorName: session.name,
    period: `últimos ${windowDays} dias (teste)`,
    generatedAt,
    farms: farmsData,
    totalAlerts,
    totalTx,
  })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to:   targetEmail,
    subject: `[TESTE] ${subject}`,
    html,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sentTo: targetEmail })
})
