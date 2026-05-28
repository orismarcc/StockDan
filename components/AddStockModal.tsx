'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  const submittingRef           = useRef(false)
  const router                  = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setError('')

    const qty = Number(quantity)
    if (!quantity || qty <= 0 || qty > 9_999_999) {
      setError('Informe uma quantidade válida (máx. 9.999.999).')
      return
    }

    setLoading(true)
    submittingRef.current = true

    // Idempotency mesmo online: protege contra retry de timeout do navegador
    const offline_id = crypto.randomUUID()

    try {
      const res = await fetch(`/api/farms/${farmId}/insumos/${insumoId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty, date, notes, offline_id }),
      })

      const data = await res.json()
      setLoading(false)
      submittingRef.current = false

      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) { setError(data.error); return }
      onSuccess()
    } catch {
      setLoading(false)
      submittingRef.current = false
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    }
  }

  return (
    <Modal open title={`Adicionar Estoque — ${insumoTitle}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Quantidade (kg) *"
          type="number"
          min="0.001"
          max="9999999"
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
          maxLength={1000}
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
