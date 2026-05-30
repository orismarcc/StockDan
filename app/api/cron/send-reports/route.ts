import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { buildReportEmail } from '@/lib/emailTemplate'

const FROM_EMAIL = 'StockDan <onboarding@resend.dev>'

/**
 * GET /api/cron/send-reports
 *
 * Cron handler — roda diariamente via Vercel Cron (vercel.json).
 * Para cada schedule habilitado e "due" hoje:
 *   1. Coleta dados do tenant (fazendas, insumos, transações do período)
 *   2. Gera email HTML profissional via buildReportEmail()
 *   3. Envia via Resend
 *   4. Atualiza last_sent_at e last_status
 *
 * Proteção: Authorization: Bearer <CRON_SECRET> (Vercel injeta automaticamente).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY não configurada.' }, { status: 500 })
  }

  const resend  = new Resend(process.env.RESEND_API_KEY)
  const supabase = createServerClient()
  const now = new Date()
  const dow = now.getUTCDay()
  const dom = now.getUTCDate()

  // Busca schedules habilitados que vencem hoje
  const { data: schedules, error: schedErr } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('enabled', true)
    .or(`and(frequency.eq.weekly,day_of_week.eq.${dow}),and(frequency.eq.monthly,day_of_month.eq.${dom})`)

  if (schedErr) {
    console.error('[cron] fetch schedules error:', schedErr.message)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }

  const results: { gestor_id: string; status: string; email?: string; error?: string }[] = []

  for (const sched of schedules ?? []) {
    // Evita reenvio no mesmo dia
    if (sched.last_sent_at) {
      const last = new Date(sched.last_sent_at)
      const sameDay =
        last.getUTCFullYear() === now.getUTCFullYear() &&
        last.getUTCMonth()    === now.getUTCMonth()    &&
        last.getUTCDate()     === now.getUTCDate()
      if (sameDay) {
        results.push({ gestor_id: sched.gestor_id, status: 'already_sent' })
        continue
      }
    }

    try {
      // ── 1. Dados do gestor ───────────────────────────────────────────────
      const { data: gestor } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', sched.gestor_id)
        .single()

      if (!gestor) {
        results.push({ gestor_id: sched.gestor_id, status: 'no_gestor' })
        continue
      }

      // ── 2. Fazendas do tenant ────────────────────────────────────────────
      const { data: farms } = await supabase
        .from('farms')
        .select('id, name, city, state, farmer_name')
        .eq('owner_id', sched.gestor_id)
        .order('name')

      if (!farms?.length) {
        results.push({ gestor_id: sched.gestor_id, status: 'no_data', email: sched.email })
        await supabase
          .from('report_schedules')
          .update({ last_sent_at: now.toISOString(), last_status: 'no_data', last_error: null })
          .eq('id', sched.id)
        continue
      }

      const farmIds = farms.map(f => f.id)

      // ── 3. Insumos ───────────────────────────────────────────────────────
      const { data: allInsumos } = await supabase
        .from('insumos')
        .select('id, farm_id, title, unit, quantity, min_quantity')
        .in('farm_id', farmIds)
        .order('title')

      // ── 4. Transações do período (últimos N dias) ────────────────────────
      const windowStart = new Date(now.getTime() - sched.window_days * 24 * 60 * 60 * 1000)
      const windowDateStr = windowStart.toISOString().split('T')[0]

      const { data: transactions } = await supabase
        .from('transactions')
        .select('id, farm_id, insumo_id, quantity, type')
        .in('farm_id', farmIds)
        .gte('date', windowDateStr)

      // ── 5. Monta estrutura de dados do email ─────────────────────────────
      const insumosByFarm = new Map<string, typeof allInsumos>()
      for (const ins of allInsumos ?? []) {
        if (!insumosByFarm.has(ins.farm_id)) insumosByFarm.set(ins.farm_id, [])
        insumosByFarm.get(ins.farm_id)!.push(ins)
      }

      const txByFarm = new Map<string, { count: number; totalKg: number }>()
      for (const tx of transactions ?? []) {
        if (!txByFarm.has(tx.farm_id)) txByFarm.set(tx.farm_id, { count: 0, totalKg: 0 })
        const entry = txByFarm.get(tx.farm_id)!
        entry.count++
        if (tx.type === 'saida') entry.totalKg += Number(tx.quantity)
      }

      const farmsData = farms.map(f => ({
        id:          f.id,
        name:        f.name,
        city:        f.city,
        state:       f.state,
        farmer_name: f.farmer_name,
        insumos:     (insumosByFarm.get(f.id) ?? []).map(i => ({
          title:        i.title,
          unit:         i.unit,
          quantity:     Number(i.quantity),
          min_quantity: i.min_quantity != null ? Number(i.min_quantity) : null,
        })),
        txCount:  txByFarm.get(f.id)?.count   ?? 0,
        totalKg:  txByFarm.get(f.id)?.totalKg ?? 0,
      }))

      const totalAlerts = farmsData.reduce((acc, farm) =>
        acc + farm.insumos.filter(i =>
          i.quantity <= 0 || (i.min_quantity != null && i.quantity <= i.min_quantity)
        ).length, 0
      )

      const totalTx = [...txByFarm.values()].reduce((a, b) => a + b.count, 0)

      const freqLabel = sched.frequency === 'weekly'
        ? `últimos 7 dias`
        : `últimos ${sched.window_days} dias`

      const generatedAt = now.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo',
      })

      const { subject, html } = buildReportEmail({
        gestorName:  gestor.name,
        period:      freqLabel,
        generatedAt,
        farms:       farmsData,
        totalAlerts,
        totalTx,
      })

      // ── 6. Envia via Resend ───────────────────────────────────────────────
      const { error: sendError } = await resend.emails.send({
        from:    FROM_EMAIL,
        to:      sched.email,
        subject,
        html,
      })

      if (sendError) {
        throw new Error(sendError.message)
      }

      // ── 7. Marca como enviado ─────────────────────────────────────────────
      await supabase
        .from('report_schedules')
        .update({ last_sent_at: now.toISOString(), last_status: 'sent', last_error: null })
        .eq('id', sched.id)

      console.log(`[cron] Relatório enviado para ${sched.email} (gestor: ${sched.gestor_id})`)
      results.push({ gestor_id: sched.gestor_id, status: 'sent', email: sched.email })

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[cron] Erro ao enviar para ${sched.gestor_id}:`, msg)

      await supabase
        .from('report_schedules')
        .update({ last_status: 'failed', last_error: msg })
        .eq('id', sched.id)

      results.push({ gestor_id: sched.gestor_id, status: 'failed', error: msg })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
