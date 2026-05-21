'use client'

import { useSyncQueue } from '@/hooks/useSyncQueue'

export function ConnectionStatus() {
  const { isOnline, syncing, pendingCount } = useSyncQueue()

  if (isOnline && pendingCount === 0 && !syncing) return null

  if (!isOnline) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-red-950/95 py-2.5 text-sm text-red-200 backdrop-blur-sm">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
        </svg>
        <span>
          Sem conexão — <strong>modo offline.</strong> Retiradas serão sincronizadas ao reconectar.
        </span>
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-950/95 py-2.5 text-sm text-amber-200 backdrop-blur-sm">
      <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span>
        Sincronizando{' '}
        <strong>
          {pendingCount} operaç{pendingCount === 1 ? 'ão' : 'ões'}
        </strong>{' '}
        pendente{pendingCount !== 1 ? 's' : ''}...
      </span>
    </div>
  )
}
