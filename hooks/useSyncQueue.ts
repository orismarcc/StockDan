'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { offlineQueue } from '@/lib/offlineQueue'
import { useOnlineStatus } from './useOnlineStatus'

export interface SyncResult {
  synced: number
  rejected: { item: import('@/lib/offlineQueue').QueueItem; reason: string }[]
}

export function useSyncQueue() {
  const isOnline = useOnlineStatus()
  const router   = useRouter()
  const [syncing,        setSyncing]        = useState(false)
  const [pendingCount,   setPendingCount]   = useState(0)
  const [rejectedItems,  setRejectedItems]  = useState<SyncResult['rejected']>([])

  useEffect(() => {
    setPendingCount(offlineQueue.count())
  }, [])

  const sync = useCallback(async (): Promise<SyncResult> => {
    const items = offlineQueue.getAll()
    if (items.length === 0) return { synced: 0, rejected: [] }

    setSyncing(true)
    let synced = 0
    const rejected: SyncResult['rejected'] = []

    for (const item of items) {
      try {
        const res = await fetch(`/api/farms/${item.farm_id}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insumo_id: item.insumo_id,
            talhao_id: item.talhao_id,
            quantity:  item.quantity,
            date:      item.date,
            notes:     item.notes,
            area_ha:   item.area_ha,
          }),
        })

        if (res.ok) {
          offlineQueue.remove(item.id)
          synced++
        } else if (res.status === 422) {
          const body = await res.json().catch(() => ({}))
          offlineQueue.remove(item.id)
          rejected.push({ item, reason: body.error ?? 'Estoque insuficiente no servidor.' })
        } else {
          const exhausted = offlineQueue.incrementRetry(item.id)
          if (exhausted) {
            rejected.push({ item, reason: 'Máximo de tentativas atingido. Verifique a conexão.' })
          }
        }
      } catch {
        const exhausted = offlineQueue.incrementRetry(item.id)
        if (exhausted) {
          rejected.push({ item, reason: 'Máximo de tentativas atingido. Verifique a conexão.' })
        }
      }
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
