'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { offlineQueue } from '@/lib/offlineQueue'
import { syncLock } from '@/lib/syncLock'
import { useOnlineStatus } from './useOnlineStatus'

export interface SyncResult {
  synced: number
  rejected: { item: import('@/lib/offlineQueue').QueueItem; reason: string }[]
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

  useEffect(() => {
    setPendingCount(offlineQueue.count())
  }, [])

  const sync = useCallback(async (): Promise<SyncResult> => {
    const items = offlineQueue.getAll()
    if (items.length === 0) return { synced: 0, rejected: [] }

    // [OFFLINE-2] Impede sync concorrente entre abas
    if (!syncLock.acquire()) return { synced: 0, rejected: [] }

    // [OFFLINE-5] Verifica conectividade real antes de gastar tentativas
    if (!(await verifyConnectivity())) {
      syncLock.release()
      return { synced: 0, rejected: [] }
    }

    // [OFFLINE-8] Atualiza contador no início para o banner mostrar o valor correto
    setPendingCount(items.length)
    setSyncing(true)

    let synced = 0
    const rejected: SyncResult['rejected'] = []

    try {
      for (const item of items) {
        // [OFFLINE-4] Timeout por requisição para não travar o banner infinitamente
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
              offline_id: item.id, // [OFFLINE-1] idempotency key
            }),
            signal: controller.signal,
          })
          clearTimeout(timer)

          if (res.ok) {
            offlineQueue.remove(item.id)
            synced++
          } else if (res.status === 422 || PERMANENT_ERRORS.includes(res.status)) {
            // [OFFLINE-6] Erros permanentes: descartar imediatamente sem gastar retries
            const body = await res.json().catch(() => ({}))
            offlineQueue.remove(item.id)
            const reason =
              res.status === 401 ? 'Sessão expirada. Faça login novamente.' :
              res.status === 403 ? 'Sem permissão para esta operação.' :
              res.status === 404 ? 'Insumo ou talhão não encontrado (pode ter sido excluído).' :
              body.error ?? 'Dados inválidos.'
            rejected.push({ item, reason })
          } else {
            // 5xx ou outro transitório — retry com backoff natural
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
    } finally {
      syncLock.release()
    }

    setSyncing(false)
    setPendingCount(offlineQueue.count())
    setRejectedItems(rejected)
    if (synced > 0 || rejected.length > 0) router.refresh()
    return { synced, rejected }
  }, [router])

  useEffect(() => {
    if (isOnline && offlineQueue.count() > 0) {
      sync()
    }
  }, [isOnline, sync])

  const clearRejected = useCallback(() => setRejectedItems([]), [])

  return { isOnline, syncing, pendingCount, rejectedItems, clearRejected, sync }
}
