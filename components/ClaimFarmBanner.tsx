'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ClaimFarmBanner({ farmId }: { farmId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClaim() {
    setLoading(true)
    const res = await fetch(`/api/farms/${farmId}/claim`, { method: 'POST' })
    setLoading(false)
    if (res.ok) {
      setDone(true)
      router.refresh()
    }
  }

  if (done) return null

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-300">Fazenda sem responsável</p>
          <p className="text-xs text-amber-500/80">Esta fazenda ainda não foi reivindicada. Clique em "Tornar minha" para assumir a gestão.</p>
        </div>
      </div>
      <button
        onClick={handleClaim}
        disabled={loading}
        className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Salvando…' : 'Tornar minha'}
      </button>
    </div>
  )
}
