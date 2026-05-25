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

const DISMISS_KEY  = 'stockdan-pwa-dismissed'
const DISMISS_DAYS = 7
const BANNER_DELAY = 2500  // ms após captura do prompt para mostrar o banner

type SwStatus = 'checking' | 'active' | 'installing' | 'unsupported' | 'failed'

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    return Date.now() - new Date(raw).getTime() < DISMISS_DAYS * 86_400_000
  } catch { return false }
}

export function PWAInstallPrompt() {
  const [ready,          setReady]          = useState(false)
  const [isIOS,          setIsIOS]          = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner,     setShowBanner]     = useState(false)  // banner fixo no rodapé
  const [isOpen,         setIsOpen]         = useState(false)  // sheet completo
  const [swStatus,       setSwStatus]       = useState<SwStatus>('checking')

  // ── Exibe banner (respeitando dismiss recente) ─────────────────────────
  function tryShowBanner() {
    if (!wasDismissedRecently()) setShowBanner(true)
  }

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (standalone) return   // já instalado — não mostra nada

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)
    setReady(true)

    // Expõe abertura do sheet via Sidebar
    window.__pwaInstallOpen = () => { setIsOpen(true); setShowBanner(false) }

    // Status do Service Worker
    if (!('serviceWorker' in navigator)) {
      setSwStatus('unsupported')
    } else {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg)          setSwStatus('failed')
        else if (reg.active) setSwStatus('active')
        else {
          setSwStatus('installing')
          const worker = reg.installing ?? reg.waiting
          worker?.addEventListener('statechange', function () {
            if (this.state === 'activated') setSwStatus('active')
          })
        }
      })
    }

    // iOS: mostra banner logo de cara (sem prompt nativo)
    if (ios) {
      setTimeout(tryShowBanner, BANNER_DELAY)
    }

    // Verifica prompt já capturado pelo script beforeInteractive
    if (window.__deferredPrompt) {
      setDeferredPrompt(window.__deferredPrompt)
      setTimeout(tryShowBanner, BANNER_DELAY)
    }

    // Escuta novos eventos de prompt
    const handlePrompt = (e: Event) => {
      e.preventDefault()
      const prompt = e as BeforeInstallPromptEvent
      window.__deferredPrompt = prompt
      setDeferredPrompt(prompt)
      setTimeout(tryShowBanner, BANNER_DELAY)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      delete window.__pwaInstallOpen
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Instalar (Android/Chrome) ──────────────────────────────────────────
  async function handleInstall() {
    if (!deferredPrompt) return
    setShowBanner(false)
    setIsOpen(false)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setReady(false)
    }
  }

  // ── Dispensar (salva timestamp) ────────────────────────────────────────
  function handleDismiss() {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()) } catch {}
    setIsOpen(false)
    setShowBanner(false)
  }

  if (!ready) return null

  return (
    <>
      {/* ── Banner fixo no rodapé ─────────────────────────────────────── */}
      {showBanner && !isOpen && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex items-center gap-3 bg-green-600 px-4 py-3 shadow-2xl">
          {/* Ícone */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-white/15">
            <img src="/icon-192.png" alt="StockDan" className="h-8 w-8 rounded-lg object-cover" />
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Instalar StockDan</p>
            <p className="text-xs text-green-100 leading-tight">Acesse offline como app nativo</p>
          </div>

          {/* Botão principal */}
          {isIOS ? (
            <button
              onClick={() => { setShowBanner(false); setIsOpen(true) }}
              className="shrink-0 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-green-700 active:bg-green-50"
            >
              Como instalar
            </button>
          ) : deferredPrompt ? (
            <button
              onClick={handleInstall}
              className="shrink-0 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-green-700 active:bg-green-50"
            >
              Instalar
            </button>
          ) : (
            <button
              onClick={() => { setShowBanner(false); setIsOpen(true) }}
              className="shrink-0 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-green-700 active:bg-green-50"
            >
              Ver instruções
            </button>
          )}

          {/* Fechar */}
          <button
            onClick={handleDismiss}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1 text-white/70 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Overlay do sheet ──────────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={handleDismiss} />
      )}

      {/* ── Sheet completo (desliza de baixo) ────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-gray-700 bg-gray-900 px-6 pb-8 pt-6 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-700" />

        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-gray-950 overflow-hidden">
            <img src="/icon-192.png" alt="StockDan" className="h-full w-full object-cover" />
          </div>
          <h3 className="text-lg font-bold text-gray-100">Instale o StockDan</h3>
          <p className="mt-1 text-sm text-gray-400">
            Acesso rápido e offline ao controle de insumos
          </p>
        </div>

        <div className="mb-5 space-y-2.5">
          <Benefit icon="wifi"  label="Funciona offline"        sub="Registre retiradas sem internet" />
          <Benefit icon="phone" label="Acesso pela tela inicial" sub="Como um app nativo no celular" />
          <Benefit icon="zap"   label="Carregamento rápido"      sub="Abre em segundos" />
        </div>

        {isIOS ? (
          /* iPhone / iPad — Safari */
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
          /* Android/Chrome — prompt nativo disponível */
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
          /* Sem prompt — diagnóstico + instruções manuais */
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-800 bg-gray-800/40 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-gray-400 mb-2">Diagnóstico</p>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${swStatus === 'active' ? 'bg-green-500' : swStatus === 'installing' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-gray-400">
                  Service Worker: {swStatus === 'active' ? 'ativo ✓' : swStatus === 'installing' ? 'instalando...' : swStatus === 'unsupported' ? 'não suportado' : 'não registrado'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-gray-400">Prompt de instalação: não disponível</span>
              </div>
            </div>

            {swStatus === 'active' ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 leading-relaxed text-center">
                  O Chrome bloqueou o prompt temporariamente. Para instalar agora:
                </p>
                <ol className="text-sm text-gray-400 space-y-1.5">
                  <li className="flex gap-2"><span className="text-green-400 font-bold shrink-0">1.</span> Toque nos <strong className="text-gray-200">⋮ três pontos</strong> do Chrome</li>
                  <li className="flex gap-2"><span className="text-green-400 font-bold shrink-0">2.</span> Procure <strong className="text-gray-200">"Instalar app"</strong></li>
                  <li className="flex gap-2"><span className="text-green-400 font-bold shrink-0">3.</span> Se não aparecer, acesse <strong className="text-gray-200">Configurações → Privacidade → Configurações do site → stockdan-app.vercel.app → Limpar</strong> e tente de novo</li>
                </ol>
              </div>
            ) : (
              <p className="text-sm text-amber-400 leading-relaxed text-center">
                O Service Worker ainda não está ativo. Recarregue a página e abra este menu novamente.
              </p>
            )}

            <button onClick={handleDismiss} className="w-full rounded-xl bg-gray-800 py-3 text-sm text-gray-400 hover:bg-gray-700 transition-colors">
              Fechar
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
