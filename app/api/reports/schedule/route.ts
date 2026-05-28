import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'

const VALID_FREQ    = ['weekly', 'monthly'] as const
const VALID_FORMAT  = ['pdf', 'xlsx'] as const
const VALID_SECTIONS = ['summary', 'transactions', 'by_insumo', 'by_talhao', 'operators'] as const

export async function GET() {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'reports.schedule')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('gestor_id', session.gestor_id)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

export async function PUT(req: NextRequest) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!can(session.role, 'reports.schedule')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const enabled     = !!body.enabled
  const frequency   = body.frequency
  const day_of_week = body.day_of_week != null ? Number(body.day_of_week) : null
  const day_of_month = body.day_of_month != null ? Number(body.day_of_month) : null
  const email       = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
  const format      = body.format
  const sections    = Array.isArray(body.sections) ? body.sections : []
  const window_days = body.window_days != null ? Number(body.window_days) : 30

  // Validações
  if (!VALID_FREQ.includes(frequency)) {
    return NextResponse.json({ error: 'Frequência inválida.' }, { status: 400 })
  }
  if (!VALID_FORMAT.includes(format)) {
    return NextResponse.json({ error: 'Formato inválido.' }, { status: 400 })
  }
  if (frequency === 'weekly' && (day_of_week == null || day_of_week < 0 || day_of_week > 6)) {
    return NextResponse.json({ error: 'Dia da semana inválido.' }, { status: 400 })
  }
  if (frequency === 'monthly' && (day_of_month == null || day_of_month < 1 || day_of_month > 28)) {
    return NextResponse.json({ error: 'Dia do mês inválido (1-28).' }, { status: 400 })
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }
  if (!sections.every((s: unknown) => typeof s === 'string' && VALID_SECTIONS.includes(s as typeof VALID_SECTIONS[number]))) {
    return NextResponse.json({ error: 'Seções inválidas.' }, { status: 400 })
  }
  if (window_days < 1 || window_days > 365) {
    return NextResponse.json({ error: 'Janela de dias inválida.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('report_schedules')
    .upsert({
      gestor_id:    session.gestor_id,
      enabled,
      frequency,
      day_of_week:  frequency === 'weekly'  ? day_of_week  : null,
      day_of_month: frequency === 'monthly' ? day_of_month : null,
      email,
      format,
      sections,
      window_days,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'gestor_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}
