'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from './ui/Select'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'
import { Button } from './ui/Button'
import { formatQuantity, todayISO } from '@/lib/utils'

interface Insumo {
  id: string
  title: string
  unit: 'kg' | 'bag'
  quantity: number
}

interface Talhao {
  id: string
  name: string
  area_ha: number
}

interface WithdrawalFormProps {
  farmId: string
  insumos: Insumo[]
  talhoes: Talhao[]
}

export function WithdrawalForm({ farmId, insumos, talhoes }: WithdrawalFormProps) {
  const router = useRouter()
  const [insumoId, setInsumoId] = useState('')
  const [talhaoId, setTalhaoId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate]         = useState(todayISO())
  const [notes, setNotes]       = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)

  const selectedInsumo = insumos.find((i) => i.id === insumoId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!insumoId || !talhaoId || !quantity || !date) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }

    const qty = Number(quantity)
    if (qty <= 0) {
      setError('Quantidade deve ser maior que zero.')
      return
    }
    if (selectedInsumo && qty > Number(selectedInsumo.quantity)) {
      setError(`Estoque insuficiente. Disponível: ${formatQuantity(selectedInsumo.quantity, selectedInsumo.unit)}`)
      return
    }

    setLoading(true)
    const res = await fetch(`/api/farms/${farmId}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumo_id: insumoId, talhao_id: talhaoId, quantity: qty, date, notes }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error)
      return
    }

    setSuccess('Retirada registrada com sucesso!')
    setQuantity('')
    setNotes('')
    router.refresh()
  }

  if (insumos.length === 0 || talhoes.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
        <p className="text-sm text-amber-400">
          {insumos.length === 0
            ? 'Nenhum insumo cadastrado nesta fazenda.'
            : 'Nenhum talhão cadastrado nesta fazenda.'}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Peça ao administrador para cadastrar os dados necessários.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Insumo */}
        <div className="flex flex-col gap-1.5">
          <Select
            label="Insumo *"
            value={insumoId}
            onChange={(e) => { setInsumoId(e.target.value); setQuantity('') }}
            required
          >
            <option value="">Selecione o insumo</option>
            {insumos.map((ins) => (
              <option key={ins.id} value={ins.id}>
                {ins.title} — {formatQuantity(ins.quantity, ins.unit)}
              </option>
            ))}
          </Select>
          {selectedInsumo && (
            <p className="text-xs text-gray-500">
              Estoque disponível:{' '}
              <span className="font-medium text-gray-300">
                {formatQuantity(selectedInsumo.quantity, selectedInsumo.unit)}
              </span>
            </p>
          )}
        </div>

        {/* Quantidade */}
        <Input
          label={`Quantidade${selectedInsumo ? ` (${selectedInsumo.unit === 'bag' ? 'sacas' : 'kg'})` : ''} *`}
          type="number"
          min="0.001"
          step="0.001"
          max={selectedInsumo ? String(selectedInsumo.quantity) : undefined}
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={selectedInsumo?.unit === 'bag' ? '1 saca = 1.000 kg' : undefined}
          required
          disabled={!insumoId}
        />

        {/* Talhão */}
        <Select
          label="Talhão de destino *"
          value={talhaoId}
          onChange={(e) => setTalhaoId(e.target.value)}
          required
        >
          <option value="">Selecione o talhão</option>
          {talhoes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({Number(t.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha)
            </option>
          ))}
        </Select>

        {/* Data */}
        <Input
          label="Data *"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />

        {/* Notas */}
        <Textarea
          label="Observação"
          placeholder="Finalidade, responsável, equipamento..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-400">
            {success}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={loading}>Confirmar Retirada</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
