'use client'

import { useSyncQueue } from '@/hooks/useSyncQueue'

export function ConnectionStatus() {
  const { isOnline, syncing, pendingCount, rejectedItems, clearRejected, sync } = useSyncQueue()

  if (rejectedItems.length > 0) {
    return (
      <div className="z-30 w-full bg-red-950/95 py-3 text-sm text-red-200">
        <div className="flex items-start justify-between gap-3 px-4">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              <strong>{rejectedItems.length} operaç{rejectedItems.length !== 1 ? 'ões' : 'ão'} rejeitada{rejectedItems.length !== 1 ? 's' : ''} pelo servidor</strong>
              {' — '}{rejectedItems[0].reason}
            </span>
          </div>
          <button onClick={clearRejected} className="shrink-0 text-red-400 hover:text-red-200 transition-colors" aria-label="Fechar">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  if (isOnline && pendingCount === 0 && !syncing) return null

  if (!isOnline) {
    return (
      <div className="z-30 w-full flex items-center justify-center gap-2 bg-red-950/95 py-2.5 text-sm text-red-200">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
        </svg>
        <span>
          Sem conexão — <strong>modo offline.</strong> Operações serão sincronizadas ao reconectar.
          {pendingCount > 0 && (
            <span className="ml-1">({pendingCount} pendente{pendingCount !== 1 ? 's' : ''})</span>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="z-30 w-full flex items-center justify-center gap-3 bg-amber-950/95 py-2.5 text-sm text-amber-200">
      {syncing ? (
        <>
          <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>
            Sincronizando{' '}
            <strong>{pendingCount} operaç{pendingCount === 1 ? 'ão' : 'ões'}</strong>
            {' '}pendente{pendingCount !== 1 ? 's' : ''}...
          </span>
        </>
      ) : (
        <>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            <strong>{pendingCount} operaç{pendingCount === 1 ? 'ão' : 'ões'}</strong>
            {' '}pendente{pendingCount !== 1 ? 's' : ''} aguardando sincronização.
          </span>
          <button
            onClick={() => sync()}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition-colors"
          >
            Sincronizar agora
          </button>
        </>
      )}
    </div>
  )
}
