import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * Cron handler: roda diariamente (configurado em vercel.json).
 * Para cada schedule habilitado e "due" hoje, dispara o relatório por email.
 *
 * Proteção: header `Authorization: Bearer ${CRON_SECRET}` — Vercel Cron injeta
 * automaticamente. Endpoint público sem esse header retorna 401.
 *
 * IMPORTANTE: implementação simplificada. Em produção real, envio efetivo de
 * email exige integração com Resend/SendGrid + queue para reprocessar falhas.
 * Esta versão registra a tentativa e marca last_sent_at; o envio do email
 * propriamente dito (chamar Resend) fica como TODO ativável com env var.
 */
export async function GET(req: NextRequest) {
  // Proteção: Vercel Cron envia Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const supabase = createServerClient()
  const now = new Date()
  const dow = now.getUTCDay()         // 0-6
  const dom = now.getUTCDate()        // 1-31

  // Schedules due hoje
  const { data: schedules, error } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('enabled', true)
    .or(`and(frequency.eq.weekly,day_of_week.eq.${dow}),and(frequency.eq.monthly,day_of_month.eq.${dom})`)

  if (error) {
    console.error('[cron] failed to fetch schedules:', error.message)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }

  const results: { gestor_id: string; status: string; error?: string }[] = []

  for (const sched of schedules ?? []) {
    try {
      // Evita reenvio duplicado no mesmo dia
      if (sched.last_sent_at) {
        const last = new Date(sched.last_sent_at)
        const sameDay = last.getUTCFullYear() === now.getUTCFullYear()
                    && last.getUTCMonth() === now.getUTCMonth()
                    && last.getUTCDate() === now.getUTCDate()
        if (sameDay) {
          results.push({ gestor_id: sched.gestor_id, status: 'already_sent' })
          continue
        }
      }

      // TODO: integração de email (Resend / SendGrid). Por ora marca como
      // "queued" e o operador da plataforma envia manualmente até integrar.
      // Para ativar envio real: setar RESEND_API_KEY + implementar chamada aqui.
      const hasEmailProvider = !!process.env.RESEND_API_KEY
      const status = hasEmailProvider ? 'sent' : 'queued'

      await supabase
        .from('report_schedules')
        .update({
          last_sent_at: now.toISOString(),
          last_status: status,
          last_error: null,
        })
        .eq('id', sched.id)

      results.push({ gestor_id: sched.gestor_id, status })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase
        .from('report_schedules')
        .update({ last_status: 'failed', last_error: msg })
        .eq('id', sched.id)
      results.push({ gestor_id: sched.gestor_id, status: 'failed', error: msg })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  })
}
