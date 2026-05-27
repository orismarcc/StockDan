'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { offlineQueue } from '@/lib/offlineQueue'
import { mutationQueue, type MutationItem } from '@/lib/mutationQueue'
import { syncLock } from '@/lib/syncLock'
import { useOnlineStatus } from './useOnlineStatus'

export interface SyncResult {
  synced: number
  rejected: { item: import('@/lib/offlineQueue').QueueItem | MutationItem; reason: string }[]
}

const PERMANENT_ERRORS = [400, 401, 403, 404]
const FETCH_TIMEOUT_MS = 15_000

async function verifyConnectivity(): Promise<boolean> {
  try {
    const r = await fetch('/api/ping', {
      signal: AbortSignal.timeout(4_000),
      cache: 'no-store',
    })
    return r.ok
  } catch {
    return false
  }
}

export function useSyncQueue() {
  const isOnline = useOnlineStatus()
  const router   = useRouter()
  const [syncing,       setSyncing]       = useState(false)
  const [pendingCount,  setPendingCount]  = useState(0)
  const [rejectedItems, setRejectedItems] = useState<SyncResult['rejected']>([])

  const updateCount = useCallback(() => {
    setPendingCount(offlineQueue.count() + mutationQueue.count())
  }, [])

  useEffect(() => { updateCount() }, [updateCount])

  // ── Drena fila de retiradas (offlineQueue) ───────────────────────────────
  const syncRetiradas = useCallback(async (): Promise<SyncResult> => {
    const items = offlineQueue.getAll()
    if (items.length === 0) return { synced: 0, rejected: [] }

    let synced = 0
    const rejected: SyncResult['rejected'] = []

    for (const item of items) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      try {
        const res = await fetch(`/api/farms/${item.farm_id}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insumo_id:  item.insumo_id,
            talhao_id:  item.talhao_id,
            quantity:   item.quantity,
            date:       item.date,
            notes:      item.notes,
            area_ha:    item.area_ha,
            offline_id: item.id,
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (res.ok) {
          offlineQueue.remove(item.id)
          synced++
          syncLock.renew()
        } else if (res.status === 422 || PERMANENT_ERRORS.includes(res.status)) {
          const body = await res.json().catch(() => ({}))
          offlineQueue.remove(item.id)
          const reason =
            res.status === 401 ? 'Sessão expirada. Faça login novamente.' :
            res.status === 403 ? 'Sem permissão para esta operação.' :
            res.status === 404 ? 'Insumo ou talhão não encontrado (pode ter sido excluído).' :
            body.error ?? 'Dados inválidos.'
          rejected.push({ item, reason })
        } else {
          const exhausted = offlineQueue.incrementRetry(item.id)
          if (exhausted) {
            rejected.push({ item, reason: 'Servidor indisponível após várias tentativas.' })
          }
        }
      } catch {
        clearTimeout(timer)
        const exhausted = offlineQueue.incrementRetry(item.id)
        if (exhausted) {
          rejected.push({ item, reason: 'Servidor indisponível após várias tentativas.' })
        }
      }
    }

    return { synced, rejected }
  }, [])

  // ── Drena fila genérica (mutationQueue) ──────────────────────────────────
  const syncMutations = useCallback(async (): Promise<SyncResult> => {
    const items = mutationQueue.getAll()
    if (items.length === 0) return { synced: 0, rejected: [] }

    let synced = 0
    const rejected: SyncResult['rejected'] = []

    for (const item of items) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      try {
        // Anexa offline_id (POST) e updated_at_client (POST/PATCH) ao payload
        const body =
          item.op === 'DELETE'
            ? undefined
            : JSON.stringify({
                ...item.payload,
                ...(item.op === 'POST' ? { offline_id: item.id } : {}),
                updated_at_client: item.client_ts,
              })

        const res = await fetch(item.endpoint, {
          method: item.op,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body,
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (res.ok) {
          mutationQueue.remove(item.id)
          synced++
          syncLock.renew()
        } else if (res.status === 422 || PERMANENT_ERRORS.includes(res.status)) {
          const errBody = await res.json().catch(() => ({}))
          mutationQueue.remove(item.id)
          const reason =
            res.status === 401 ? 'Sessão expirada. Faça login novamente.' :
            res.status === 403 ? 'Sem permissão para esta operação.' :
            res.status === 404 && item.op === 'DELETE' ? 'Registro já não existia (OK).' :
            res.status === 404 ? 'Registro não encontrado (pode ter sido excluído).' :
            errBody.error ?? 'Dados inválidos.'
          // 404 em DELETE não é erro real — registro já estava deletado
          if (!(res.status === 404 && item.op === 'DELETE')) {
            rejected.push({ item, reason })
          } else {
            synced++
          }
        } else {
          const exhausted = mutationQueue.incrementRetry(item.id)
          if (exhausted) {
            rejected.push({ item, reason: 'Servidor indisponível após várias tentativas.' })
          }
        }
      } catch {
        clearTimeout(timer)
        const exhausted = mutationQueue.incrementRetry(item.id)
        if (exhausted) {
          rejected.push({ item, reason: 'Servidor indisponível após várias tentativas.' })
        }
      }
    }

    return { synced, rejected }
  }, [])

  // ── Orquestrador: drena ambas as filas sob mesmo lock ────────────────────
  const sync = useCallback(async (): Promise<SyncResult> => {
    const totalPending = offlineQueue.count() + mutationQueue.count()
    if (totalPending === 0) return { synced: 0, rejected: [] }

    if (!syncLock.acquire()) return { synced: 0, rejected: [] }

    if (!(await verifyConnectivity())) {
      syncLock.release()
      return { synced: 0, rejected: [] }
    }

    setPendingCount(totalPending)
    setSyncing(true)

    let combinedSynced = 0
    let combinedRejected: SyncResult['rejected'] = []

    try {
      const r1 = await syncRetiradas()
      const r2 = await syncMutations()
      combinedSynced = r1.synced + r2.synced
      combinedRejected = [...r1.rejected, ...r2.rejected]
    } finally {
      syncLock.release()
    }

    setSyncing(false)
    updateCount()
    setRejectedItems(combinedRejected)
    if (combinedSynced > 0 || combinedRejected.length > 0) router.refresh()
    return { synced: combinedSynced, rejected: combinedRejected }
  }, [router, syncRetiradas, syncMutations, updateCount])

  useEffect(() => {
    const total = offlineQueue.count() + mutationQueue.count()
    if (isOnline && total > 0) {
      sync()
    }
  }, [isOnline, sync])

  const clearRejected = useCallback(() => setRejectedItems([]), [])

  return { isOnline, syncing, pendingCount, rejectedItems, clearRejected, sync }
}
