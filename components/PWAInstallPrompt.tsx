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
  // Começa false, só renderiza depois de verificar se está em standalone
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    // Já instalado: não mostrar nada
    if (standalone) return

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    // Sempre pronto quando não está em standalone
    setReady(true)

    // Expõe função para o Sidebar reabrir o sheet
    window.__pwaInstallOpen = () => setIsOpen(true)

    // Pega prompt já capturado pelo script inline no <head>
    if (window.__deferredPrompt) {
      setDeferredPrompt(window.__deferredPrompt)
    }

    // Continua escutando caso ainda não tenha disparado
    const handlePrompt = (e: Event) => {
      e.preventDefault()
      const prompt = e as BeforeInstallPromptEvent
      window.__deferredPrompt = prompt
      setDeferredPrompt(prompt)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)

    // Auto-abre após delay se não foi dispensado recentemente
    const dismissed = localStorage.getItem(DISMISS_KEY)
    const recentlyDismissed = dismissed
      ? (Date.now() - new Date(dismissed).getTime()) / 86_400_000 < DISMISS_DAYS
      : false

    if (!recentlyDismissed) {
      if (ios) {
        // iOS: sempre auto-abre (instruções manuais)
        setTimeout(() => setIsOpen(true), 2500)
      } else if (window.__deferredPrompt) {
        // Prompt já disponível: auto-abre
        setTimeout(() => setIsOpen(true), 2500)
      } else {
        // Aguarda o prompt chegar e abre quando chegar
        window.addEventListener(
          'beforeinstallprompt',
          () => setTimeout(() => setIsOpen(true), 2500),
          { once: true }
        )
      }
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
      setReady(false)
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString())
    setIsOpen(false)
  }

  // Não renderiza no server nem se já estiver instalado
  if (!ready) return null

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={handleDismiss} />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-gray-700 bg-gray-900 px-6 pb-8 pt-6 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-700" />

        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-gray-950 overflow-hidden">
            <img src="/icon192" alt="StockDan" className="h-full w-full object-cover" />
          </div>
          <h3 className="text-lg font-bold text-gray-100">Instale o StockDan</h3>
          <p className="mt-1 text-sm text-gray-400">
            Acesso rápido e offline ao controle de insumos
          </p>
        </div>

        <div className="mb-5 space-y-2.5">
          <Benefit icon="wifi" label="Funciona offline" sub="Registre retiradas sem internet" />
          <Benefit icon="phone" label="Acesso pela tela inicial" sub="Como um app nativo no celular" />
          <Benefit icon="zap" label="Carregamento rápido" sub="Abre em segundos" />
        </div>

        {isIOS ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-gray-400 leading-relaxed">
              No <strong className="text-gray-200">Safari</strong>, toque em{' '}
              <svg className="inline h-4 w-4 align-middle text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>{' '}
              e depois em <strong className="text-gray-200">"Adicionar à Tela de Início"</strong>
            </p>
            <button onClick={handleDismiss} className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-semibold text-white">
              Entendi
            </button>
          </div>
        ) : deferredPrompt ? (
          <div className="space-y-2.5">
            <button
              onClick={handleInstall}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-sm font-semibold text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Instalar Agora
            </button>
            <button onClick={handleDismiss} className="w-full rounded-xl py-3 text-sm text-gray-500 hover:text-gray-400 transition-colors">
              Talvez depois
            </button>
          </div>
        ) : (
          // Navegador não suporta install prompt automático — instrução genérica
          <div className="space-y-3">
            <p className="text-center text-sm text-gray-400 leading-relaxed">
              Abra este site no <strong className="text-gray-200">Chrome</strong> e use o menu do navegador para adicionar à tela inicial.
            </p>
            <button onClick={handleDismiss} className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-semibold text-white">
              Entendi
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
