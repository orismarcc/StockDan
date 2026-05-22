'use client'

import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'
import { Button } from './ui/Button'
import { todayISO } from '@/lib/utils'

interface AddStockModalProps {
  farmId: string
  insumoId: string
  insumoTitle: string
  unit?: string
  onClose: () => void
  onSuccess: () => void
}

export function AddStockModal({ farmId, insumoId, insumoTitle, unit, onClose, onSuccess }: AddStockModalProps) {
  const [quantity, setQuantity] = useState('')
  const [date, setDate]         = useState(todayISO())
  const [notes, setNotes]       = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!quantity || Number(quantity) <= 0) {
      setError('Informe uma quantidade válida.')
      return
    }

    setLoading(true)
    const res = await fetch(`/api/farms/${farmId}/insumos/${insumoId}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: Number(quantity), date, notes }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    onSuccess()
  }

  return (
    <Modal open title={`Adicionar Estoque — ${insumoTitle}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Quantidade (kg) *"
          type="number"
          min="0.001"
          step="0.001"
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={undefined}
          required
        />
        <Input
          label="Data *"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <Textarea
          label="Observação"
          placeholder="Nota fiscal, lote, fornecedor..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={loading}>Confirmar Entrada</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  )
}
