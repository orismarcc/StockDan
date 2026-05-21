'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { offlineQueue } from '@/lib/offlineQueue'
import { useOnlineStatus } from './useOnlineStatus'

export function useSyncQueue() {
  const isOnline = useOnlineStatus()
  const router   = useRouter()
  const [syncing,      setSyncing]      = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    setPendingCount(offlineQueue.count())
  }, [])

  const sync = useCallback(async () => {
    const items = offlineQueue.getAll()
    if (items.length === 0) return

    setSyncing(true)
    let synced = 0

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
          }),
        })

        // Sucesso ou 422 (estoque insuficiente — item já foi processado ou inválido)
        if (res.ok || res.status === 422) {
          offlineQueue.remove(item.id)
          synced++
        } else {
          offlineQueue.incrementRetry(item.id)
        }
      } catch {
        offlineQueue.incrementRetry(item.id)
      }
    }

    setSyncing(false)
    setPendingCount(offlineQueue.count())
    if (synced > 0) router.refresh()
  }, [router])

  useEffect(() => {
    if (isOnline && offlineQueue.count() > 0) {
      sync()
    }
  }, [isOnline, sync])

  return { isOnline, syncing, pendingCount, sync }
}
