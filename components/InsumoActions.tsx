'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddStockModal } from './AddStockModal'
import { Button } from './ui/Button'

interface InsumoActionsProps {
  farmId: string
  insumo: { id: string; title: string; unit: 'kg' | 'bag' }
}

export function InsumoActions({ farmId, insumo }: InsumoActionsProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Adicionar Estoque
      </Button>

      {open && (
        <AddStockModal
          farmId={farmId}
          insumoId={insumo.id}
          insumoTitle={insumo.title}
          unit={insumo.unit}
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
