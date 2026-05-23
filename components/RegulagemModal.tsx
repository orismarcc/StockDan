'use client'

import { ImplementAdjustmentForm } from './ImplementAdjustmentForm'

interface RegulagemModalProps {
  farmId: string
  talhaoId: string
  talhaoName: string
  onClose: () => void
}

export function RegulagemModal({ farmId, talhaoId, talhaoName, onClose }: RegulagemModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="my-6 w-full max-w-lg rounded-2xl border border-blue-500/20 bg-gray-900 shadow-2xl shadow-blue-900/20">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <svg className="h-4 w-4 shrink-0 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-100">Nova Regulagem de Implemento</h3>
            </div>
            <p className="text-xs text-blue-400/60 truncate">{talhaoName}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            aria-label="Fechar"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5">
          <ImplementAdjustmentForm
            farmId={farmId}
            talhaoId={talhaoId}
            onSuccess={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
