'use client'

import { useState } from 'react'

interface Props {
  onConfirm: () => Promise<void>
  /** className override — padrão é ícone de lixeira pequeno */
  className?: string
  /** Tamanho do ícone: 'sm' = h-4 w-4 (padrão), 'md' = h-5 w-5 */
  iconSize?: 'sm' | 'md'
}

const TrashIcon = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => (
  <svg
    className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)

export function ConfirmDeleteButton({ onConfirm, className, iconSize = 'sm' }: Props) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading'>('idle')

  async function handleConfirm() {
    setStep('loading')
    try {
      await onConfirm()
    } catch {
      setStep('idle')
    }
  }

  if (step === 'loading') {
    return (
      <span className={className ?? 'inline-flex items-center justify-center rounded-md p-1.5 text-red-400/40'}>
        <TrashIcon size={iconSize} />
      </span>
    )
  }

  if (step === 'confirm') {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="text-xs text-red-400 whitespace-nowrap">Confirmar exclusão?</span>
        <span className="inline-flex items-center gap-1.5">
          <button
            onClick={handleConfirm}
            className="min-h-[36px] rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-sm font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
          >
            Sim
          </button>
          <button
            onClick={() => setStep('idle')}
            className="min-h-[36px] rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Não
          </button>
        </span>
      </span>
    )
  }

  return (
    <button
      onClick={() => setStep('confirm')}
      title="Apagar"
      className={
        className ??
        'inline-flex items-center justify-center rounded-md p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors'
      }
    >
      <TrashIcon size={iconSize} />
    </button>
  )
}
