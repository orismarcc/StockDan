import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { withAuth } from '@/lib/withAuth'

const DEFAULT_LIMIT = 50
const MAX_LIMIT     = 200

export const GET = withAuth(async (req, session) => {
  if (!can(session.role, 'audit.view')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const sp = new URL(req.url).searchParams
  const entity   = sp.get('entity')
  const action   = sp.get('action')
  const actorId  = sp.get('actor_id')
  const farmId   = sp.get('farm_id')
  const page     = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0)
  const limit    = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
  const from     = page * limit
  const to       = from + limit - 1

  const supabase = createServerClient()

  // P8: filtra por gestor_id do tenant
  let query = supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, farm_id, summary, changes, created_at, actor_role, actor_name', { count: 'exact' })
    .eq('gestor_id', session.gestor_id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (entity)  query = query.eq('entity', entity)
  if (action)  query = query.eq('action', action)
  if (actorId) query = query.eq('actor_id', actorId)
  if (farmId)  query = query.eq('farm_id', farmId)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })

  return NextResponse.json(data ?? [], {
    headers: { 'X-Total-Count': String(count ?? 0) },
  })
})
