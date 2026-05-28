// lib/audit.ts
//
// Helper para registrar eventos no audit_log. Sempre fire-and-forget (não bloqueia
// o response). Erro de audit NÃO deve falhar a operação principal — só loga no console.
//
// Uso típico em route handler:
//
//   await logAudit(supabase, session, {
//     action: 'delete',
//     entity: 'talhao',
//     entity_id: tid,
//     farm_id,
//     summary: `Excluiu talhão "${talhao.name}" (${talhao.area_ha} ha)`,
//   })
//
// Padrão P8: gestor_id é sempre o do tenant da session, garantindo isolamento.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionUser } from './auth'

export type AuditAction = 'create' | 'update' | 'delete'
export type AuditEntity = 'farm' | 'talhao' | 'insumo' | 'transaction' | 'adjustment' | 'user'

export interface AuditEntry {
  action: AuditAction
  entity: AuditEntity
  entity_id?: string | null
  farm_id?: string | null
  summary: string
  /** Snapshot opcional dos campos alterados: { before, after } ou só after */
  changes?: Record<string, unknown>
}

/**
 * Insere uma entrada no audit_log. Não joga exceção — falhas são logadas
 * no console.error e a operação principal continua.
 */
export async function logAudit(
  supabase: SupabaseClient,
  session: SessionUser,
  entry: AuditEntry
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      gestor_id:  session.gestor_id,
      actor_id:   session.id,
      actor_role: session.role,
      actor_name: session.name,
      action:     entry.action,
      entity:     entry.entity,
      entity_id:  entry.entity_id ?? null,
      farm_id:    entry.farm_id ?? null,
      summary:    entry.summary,
      changes:    entry.changes ?? null,
    })
    if (error) {
      console.error('[audit] insert failed:', error.message)
    }
  } catch (e) {
    console.error('[audit] unexpected error:', e)
  }
}
