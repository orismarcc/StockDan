'use client'

import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <svg className="mb-4 h-12 w-12 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h2 className="mb-2 text-lg font-semibold text-gray-100">Erro ao carregar fazenda</h2>
      <p className="mb-6 max-w-sm text-sm text-gray-500">
        {error.message || 'Não foi possível carregar os dados desta fazenda.'}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
        >
          Tentar novamente
        </button>
        <Link
          href="/farms"
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          Voltar às fazendas
        </Link>
      </div>
    </div>
  )
}
