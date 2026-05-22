'use client'

import { useEffect } from 'react'

export function SwRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      console.log('[SW] Service Worker não suportado neste navegador')
      return
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registrado com sucesso. Scope:', reg.scope)
        console.log('[SW] Estado:', reg.active ? 'ativo' : reg.installing ? 'instalando' : reg.waiting ? 'aguardando' : 'desconhecido')

        // Quando o SW ativar (ou já estiver ativo), loga
        if (reg.active) {
          console.log('[SW] SW já está ativo e controlando a página')
        } else {
          const worker = reg.installing ?? reg.waiting
          worker?.addEventListener('statechange', function () {
            console.log('[SW] Novo estado:', this.state)
          })
        }
      })
      .catch((err) => {
        console.error('[SW] Falha ao registrar:', err)
      })
  }, [])

  return null
}
