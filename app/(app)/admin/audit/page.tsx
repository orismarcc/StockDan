import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { formatDate, formatTime } from '@/lib/utils'

export const metadata = { title: 'Auditoria' }

type AuditRow = {
  id: string
  action: 'create' | 'update' | 'delete'
  entity: string
  entity_id: string | null
  farm_id: string | null
  summary: string
  changes: unknown
  created_at: string
  actor_role: string
  actor_name: string
}

const ENTITY_LABEL: Record<string, string> = {
  farm: 'Fazenda',
  talhao: 'Talhão',
  insumo: 'Insumo',
  transaction: 'Transação',
  adjustment: 'Regulagem',
  user: 'Usuário',
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Criou',
  update: 'Alterou',
  delete: 'Excluiu',
}

function actionColor(action: string): string {
  switch (action) {
    case 'create': return 'border-green-500/30 bg-green-500/10 text-green-400'
    case 'update': return 'border-blue-500/30 bg-blue-500/10 text-blue-400'
    case 'delete': return 'border-red-500/30 bg-red-500/10 text-red-400'
    default:       return 'border-gray-700 bg-gray-800 text-gray-400'
  }
}

export default async function AuditPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.role, 'audit.view')) redirect('/dashboard')

  const supabase = createServerClient()
  const { data: logs } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, farm_id, summary, changes, created_at, actor_role, actor_name')
    .eq('gestor_id', session.gestor_id)
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (logs ?? []) as AuditRow[]

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-100">Auditoria</h1>
        <p className="mt-1 text-sm text-gray-500">
          Histórico de ações sensíveis no tenant — quem fez, o que e quando.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 py-16 text-center">
          <p className="text-sm text-gray-500">Nenhum evento registrado ainda.</p>
          <p className="mt-1 text-xs text-gray-600">Eventos como exclusões e alterações sensíveis aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((log) => (
            <div key={log.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${actionColor(log.action)}`}>
                      {ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    <span className="text-xs text-gray-500">
                      {ENTITY_LABEL[log.entity] ?? log.entity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200">{log.summary}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    por <span className="text-gray-400">{log.actor_name}</span>
                    <span className="text-gray-600"> ({log.actor_role})</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-400">{formatDate(log.created_at.split('T')[0])}</p>
                  <p className="text-[11px] text-gray-600">{formatTime(log.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-600">
        Mostrando até 200 eventos mais recentes. Para auditoria completa, exporte via API.
      </p>
    </div>
  )
}
