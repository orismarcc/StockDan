'use client'

import { useRouter } from 'next/navigation'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'

export function DeleteFarmButton({ farmId }: { farmId: string }) {
  const router = useRouter()

  return (
    <ConfirmDeleteButton
      iconSize="md"
      className="flex items-center justify-center rounded-lg border border-red-500/20 bg-red-500/8 p-2.5 sm:p-2 text-red-400/70 hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 transition-colors"
      onConfirm={async () => {
        const res = await fetch(`/api/farms/${farmId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Falha ao apagar fazenda')
        router.push('/dashboard')
      }}
    />
  )
}
