'use client'

import { useEffect, useState } from 'react'

export function SwRegistration() {
  const [updateReady, setUpdateReady] = useState(false)
  const [newWorker, setNewWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // [SW-1] Detecta novo SW instalado e aguardando ativação
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // Novo SW instalado e pronto — aguarda confirmação do usuário
              setNewWorker(installing)
              setUpdateReady(true)
            }
          })
        })
      })
      .catch(() => {})
  }, [])

  function handleUpdate() {
    newWorker?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  if (!updateReady) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-green-500/30 bg-gray-900 px-4 py-3 shadow-xl text-sm">
      <svg className="h-4 w-4 shrink-0 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      <span className="text-gray-300">Nova versão disponível</span>
      <button
        onClick={handleUpdate}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
      >
        Atualizar
      </button>
      <button
        onClick={() => setUpdateReady(false)}
        className="text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Fechar"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  )
}
