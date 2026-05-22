'use client'

import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'
import { Button } from './ui/Button'
import { Select } from './ui/Select'
import type { Transaction } from './TransactionTable'

interface Talhao {
  id: string
  name: string
  area_ha: number
}

interface EditTransactionModalProps {
  farmId: string
  transaction: Transaction
  talhoes: Talhao[]
  onClose: () => void
  onSuccess: () => void
}

export function EditTransactionModal({
  farmId,
  transaction,
  talhoes,
  onClose,
  onSuccess,
}: EditTransactionModalProps) {
  const [quantity, setQuantity] = useState(String(transaction.quantity))
  const [date, setDate] = useState(transaction.date)
  const [talhaoId, setTalhaoId] = useState(transaction.talhoes?.id ?? '')
  const [notes, setNotes] = useState(transaction.notes ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const unitLabel = 'kg'
  const typeLabel = transaction.type === 'entrada' ? 'Entrada' : 'Retirada'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!quantity || Number(quantity) <= 0) {
      setError('Informe uma quantidade válida.')
      return
    }

    setLoading(true)
    const res = await fetch(`/api/farms/${farmId}/transactions/${transaction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: Number(quantity),
        date,
        talhao_id: talhaoId || undefined,
        notes: notes || null,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error)
      return
    }
    onSuccess()
  }

  return (
    <Modal open title={`Editar ${typeLabel} — ${transaction.insumos?.title ?? ''}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={`Quantidade (${unitLabel}) *`}
          type="number"
          min="0.001"
          step="0.001"
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
        {talhoes.length > 0 && (
          <Select
            label="Talhão"
            value={talhaoId}
            onChange={(e) => setTalhaoId(e.target.value)}
          >
            <option value="">Sem talhão</option>
            {talhoes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        <Textarea
          label="Observação"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={loading}>Salvar alterações</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  )
}
