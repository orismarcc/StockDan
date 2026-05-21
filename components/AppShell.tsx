'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { ConnectionStatus } from './ConnectionStatus'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface AppShellProps {
  role: 'admin' | 'operario'
  userName: string
  children: React.ReactNode
}

export function AppShell({ role, userName, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installMode, setInstallMode] = useState<'android' | 'ios' | null>(null)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    if (isStandalone) return

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    if (isIOS) {
      setInstallMode('ios')
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setInstallMode('android')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (installMode === 'ios') {
      setShowIOSGuide(true)
      return
    }
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setInstallMode(null)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <ConnectionStatus />

      {/* iOS install guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowIOSGuide(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <h3 className="mb-4 text-center text-base font-semibold text-gray-100">
              Instalar no iPhone / iPad
            </h3>
            <ol className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-xs font-bold text-green-400 mt-0.5">
                  1
                </span>
                <span>
                  Abra este site no <strong className="text-gray-200">Safari</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-xs font-bold text-green-400 mt-0.5">
                  2
                </span>
                <span className="flex items-center gap-1 flex-wrap">
                  Toque no botão de compartilhar
                  <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                  na barra inferior
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-xs font-bold text-green-400 mt-0.5">
                  3
                </span>
                <span>
                  Selecione <strong className="text-gray-200">"Adicionar à Tela de Início"</strong> e confirme
                </span>
              </li>
            </ol>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-lg bg-green-500 py-2.5 text-sm font-medium text-white"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <Sidebar
        role={role}
        userName={userName}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        canInstall={!!installMode}
        onInstall={installMode ? handleInstall : undefined}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-950 px-4 py-3 lg:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-base font-bold tracking-tight">
            <span className="text-white">Stock</span>
            <span className="text-green-400">Dan</span>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6 lg:py-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
