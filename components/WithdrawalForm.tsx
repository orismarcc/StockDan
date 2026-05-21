'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from './ui/Select'
import { Input } from './ui/Input'
import { Textarea } from './ui/Textarea'
import { Button } from './ui/Button'
import { formatQuantity, todayISO } from '@/lib/utils'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { offlineQueue } from '@/lib/offlineQueue'
import { insumoCache } from '@/lib/insumoCache'

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
  const router   = useRouter()
  const isOnline = useOnlineStatus()

  const [insumoId,  setInsumoId]  = useState('')
  const [talhaoId,  setTalhaoId]  = useState('')
  const [quantity,  setQuantity]  = useState('')
  const [date,      setDate]      = useState(todayISO())
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [offlineOk, setOfflineOk] = useState(false)

  // Quantidades locais: espelham o servidor, mas são ajustadas otimisticamente offline
  const [localQtys, setLocalQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(insumos.map((i) => [i.id, i.quantity]))
  )

  // Sempre que o servidor enviar dados frescos, atualizar cache e estado local
  useEffect(() => {
    setLocalQtys(Object.fromEntries(insumos.map((i) => [i.id, i.quantity])))
    insumoCache.setFarm(
      farmId,
      insumos.map((i) => ({ id: i.id, title: i.title, unit: i.unit, quantity: i.quantity }))
    )
  }, [farmId, insumos])

  const selectedInsumo = insumos.find((i) => i.id === insumoId)
  const availableQty   = insumoId ? (localQtys[insumoId] ?? 0) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setOfflineOk(false)

    if (!insumoId || !talhaoId || !quantity || !date) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }

    const qty = Number(quantity)
    if (qty <= 0) {
      setError('Quantidade deve ser maior que zero.')
      return
    }
    if (qty > availableQty) {
      setError(`Estoque insuficiente. Disponível: ${formatQuantity(availableQty, selectedInsumo!.unit)}`)
      return
    }

    setLoading(true)

    if (!isOnline) {
      // Modo offline: enfileira e atualiza cache local
      offlineQueue.add({ farm_id: farmId, insumo_id: insumoId, talhao_id: talhaoId, quantity: qty, date, notes: notes || null })
      insumoCache.decreaseQuantity(farmId, insumoId, qty)
      setLocalQtys((prev) => ({ ...prev, [insumoId]: Math.max(0, (prev[insumoId] ?? 0) - qty) }))
      setLoading(false)
      setOfflineOk(true)
      setQuantity('')
      setNotes('')
      return
    }

    // Modo online: envia diretamente
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

    // Atualiza quantidade local com o valor retornado pelo servidor
    if (typeof data.newQuantity === 'number') {
      setLocalQtys((prev) => ({ ...prev, [insumoId]: data.newQuantity }))
      insumoCache.decreaseQuantity(farmId, insumoId, qty)
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
      {!isOnline && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
          </svg>
          <span>Sem conexão — a retirada será salva localmente e sincronizada ao reconectar.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
                {ins.title} — {formatQuantity(localQtys[ins.id] ?? ins.quantity, ins.unit)}
              </option>
            ))}
          </Select>
          {selectedInsumo && (
            <p className="text-xs text-gray-500">
              Estoque disponível:{' '}
              <span className="font-medium text-gray-300">
                {formatQuantity(availableQty, selectedInsumo.unit)}
              </span>
            </p>
          )}
        </div>

        <Input
          label={`Quantidade${selectedInsumo ? ` (${selectedInsumo.unit === 'bag' ? 'sacas' : 'kg'})` : ''} *`}
          type="number"
          min="0.001"
          step="0.001"
          max={selectedInsumo ? String(availableQty) : undefined}
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={selectedInsumo?.unit === 'bag' ? '1 saca = 1.000 kg' : undefined}
          required
          disabled={!insumoId}
        />

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

        <Input
          label="Data *"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />

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
        {offlineOk && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Retirada salva offline. Será enviada ao servidor ao reconectar.</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={loading}>
            {isOnline ? 'Confirmar Retirada' : 'Salvar Offline'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
