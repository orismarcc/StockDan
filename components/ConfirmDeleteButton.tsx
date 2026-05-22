'use client'

import { useState } from 'react'

interface Props {
  onConfirm: () => Promise<void>
  label?: string
  confirmLabel?: string
  className?: string
}

export function ConfirmDeleteButton({
  onConfirm,
  label = 'Apagar',
  confirmLabel = 'Confirmar?',
  className = '',
}: Props) {
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
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500">
        Apagando…
      </span>
    )
  }

  if (step === 'confirm') {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-[11px] text-red-400 whitespace-nowrap mr-0.5">{confirmLabel}</span>
        <button
          onClick={handleConfirm}
          className="rounded border border-red-500/40 bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
        >
          Sim
        </button>
        <button
          onClick={() => setStep('idle')}
          className="rounded border border-gray-700 bg-gray-800/60 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
        >
          Não
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setStep('confirm')}
      className={
        className ||
        'inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-xs font-medium text-red-400/80 hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 transition-colors'
      }
    >
      {label}
    </button>
  )
}
