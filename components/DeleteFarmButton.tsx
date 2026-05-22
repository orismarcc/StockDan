'use client'

import { useRouter } from 'next/navigation'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'

export function DeleteFarmButton({ farmId }: { farmId: string }) {
  const router = useRouter()

  return (
    <ConfirmDeleteButton
      label="Apagar Fazenda"
      confirmLabel="Apagar definitivamente?"
      onConfirm={async () => {
        const res = await fetch(`/api/farms/${farmId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Falha ao apagar fazenda')
        router.push('/dashboard')
      }}
      className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2.5 sm:py-2 text-sm font-medium text-red-400/80 hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 transition-colors"
    />
  )
}
