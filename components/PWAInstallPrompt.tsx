'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __deferredPrompt?: BeforeInstallPromptEvent
    __pwaInstallOpen?: () => void
  }
}

const DISMISS_KEY = 'stockdan-pwa-dismissed'
const DISMISS_DAYS = 7

export function PWAInstallPrompt() {
  const [isOpen, setIsOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  // null = ainda não verificado (evita flash no SSR)
  const [canShow, setCanShow] = useState<boolean | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (standalone) {
      setCanShow(false)
      return
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    setIsIOS(ios)

    // Expõe função para que o Sidebar possa abrir o sheet manualmente
    window.__pwaInstallOpen = () => setIsOpen(true)

    // Verifica se foi dispensado recentemente
    const dismissed = localStorage.getItem(DISMISS_KEY)
    const recentlyDismissed = dismissed
      ? (Date.now() - new Date(dismissed).getTime()) / 86_400_000 < DISMISS_DAYS
      : false

    const showAfterDelay = () => {
      if (!recentlyDismissed) setTimeout(() => setIsOpen(true), 2500)
    }

    // Captura o prompt do navegador (Android/Chrome)
    const handlePrompt = (e: Event) => {
      e.preventDefault()
      const prompt = e as BeforeInstallPromptEvent
      window.__deferredPrompt = prompt
      setDeferredPrompt(prompt)
      setCanShow(true)
      showAfterDelay()
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)

    // iOS: sempre pode mostrar (instruções manuais)
    if (ios) {
      setCanShow(true)
      showAfterDelay()
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      delete window.__pwaInstallOpen
    }
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsOpen(false)
      setDeferredPrompt(null)
      setCanShow(false)
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString())
    setIsOpen(false)
  }

  // Não renderiza enquanto não sabe, ou se não pode instalar
  if (canShow !== true) return null

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60"
          onClick={handleDismiss}
        />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-gray-700 bg-gray-900 px-6 pb-8 pt-6 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-700" />

        {/* Ícone + título */}
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-gray-950 overflow-hidden">
            <img src="/icon192" alt="StockDan" className="h-full w-full object-cover" />
          </div>
          <h3 className="text-lg font-bold text-gray-100">Instale o StockDan</h3>
          <p className="mt-1 text-sm text-gray-400">
            Acesso rápido e offline ao controle de insumos
          </p>
        </div>

        {/* Benefícios */}
        <div className="mb-5 space-y-2.5">
          <Benefit
            icon="wifi"
            label="Funciona offline"
            sub="Registre retiradas sem internet"
          />
          <Benefit
            icon="phone"
            label="Acesso pela tela inicial"
            sub="Como um app nativo no celular"
          />
          <Benefit
            icon="zap"
            label="Carregamento rápido"
            sub="Abre em segundos"
          />
        </div>

        {/* Ações */}
        {isIOS ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-gray-400 leading-relaxed">
              No <strong className="text-gray-200">Safari</strong>, toque em{' '}
              <svg
                className="inline h-4 w-4 align-middle text-gray-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>{' '}
              e depois em{' '}
              <strong className="text-gray-200">"Adicionar à Tela de Início"</strong>
            </p>
            <button
              onClick={handleDismiss}
              className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-semibold text-white"
            >
              Entendi
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              onClick={handleInstall}
              disabled={!deferredPrompt}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Instalar Agora
            </button>
            <button
              onClick={handleDismiss}
              className="w-full rounded-xl py-3 text-sm text-gray-500 hover:text-gray-400 transition-colors"
            >
              Talvez depois
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Benefit({ icon, label, sub }: { icon: 'wifi' | 'phone' | 'zap'; label: string; sub: string }) {
  const icons = {
    wifi: (
      <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
      </svg>
    ),
    phone: (
      <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" />
      </svg>
    ),
    zap: (
      <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-800/50 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
        {icons[icon]}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
    </div>
  )
}
