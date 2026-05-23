'use client'

import { useState, useEffect, useRef } from 'react'
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
  unit: string
  quantity: number
}

interface Talhao {
  id: string
  name: string
  area_ha: number
}

interface TalhaoStat {
  accumArea: number
  lastKgHa: number | null
  lastDate: string | null
}

interface WithdrawalFormProps {
  farmId: string
  insumos: Insumo[]
  talhoes: Talhao[]
  /** talhaoStats[talhaoId][insumoId] = stats de aplicação daquele insumo naquele talhão */
  talhaoStats?: Record<string, Record<string, TalhaoStat>>
  initialTalhaoId?: string
}

export function WithdrawalForm({ farmId, insumos, talhoes, talhaoStats = {}, initialTalhaoId = '' }: WithdrawalFormProps) {
  const router   = useRouter()
  const isOnline = useOnlineStatus()

  const [insumoId,  setInsumoId]  = useState('')
  const [talhaoId,  setTalhaoId]  = useState(initialTalhaoId)
  const [quantity,  setQuantity]  = useState('')
  const [areaHa,    setAreaHa]    = useState('')
  const [date,      setDate]      = useState(todayISO())
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [offlineOk, setOfflineOk] = useState(false)
  const submittingRef = useRef(false)

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

  const selectedInsumo  = insumos.find((i) => i.id === insumoId)
  const availableQty    = insumoId ? (localQtys[insumoId] ?? 0) : 0
  const selectedTalhao  = talhoes.find((t) => t.id === talhaoId)
  // Stat específico do insumo selecionado no talhão selecionado
  const selectedTalhaoStat = (talhaoId && insumoId)
    ? (talhaoStats[talhaoId]?.[insumoId] ?? null)
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return // guard contra double-submit
    setError('')
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
    submittingRef.current = true

    const area = areaHa ? parseFloat(areaHa.replace(',', '.')) : null
    const areaPayload = area != null && area > 0 ? area : null

    if (!isOnline) {
      // Modo offline: enfileira e atualiza cache local
      try {
        offlineQueue.add({ farm_id: farmId, insumo_id: insumoId, talhao_id: talhaoId, quantity: qty, date, notes: notes || null, area_ha: areaPayload })
        insumoCache.decreaseQuantity(farmId, insumoId, qty)
        setLocalQtys((prev) => ({ ...prev, [insumoId]: Math.max(0, (prev[insumoId] ?? 0) - qty) }))
        setLoading(false)
        submittingRef.current = false
        setOfflineOk(true)
        setQuantity('')
        setAreaHa('')
        setNotes('')
      } catch (e) {
        setLoading(false)
        submittingRef.current = false
        if (e instanceof Error && e.message === 'STORAGE_FULL') {
          setError('Armazenamento local cheio. Conecte-se à internet ou libere espaço no dispositivo.')
        } else {
          setError('Falha ao salvar localmente. Tente novamente.')
        }
      }
      return
    }

    // Modo online: envia diretamente
    const res = await fetch(`/api/farms/${farmId}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumo_id: insumoId, talhao_id: talhaoId, quantity: qty, date, notes, area_ha: areaPayload }),
    })

    const data = await res.json()
    setLoading(false)
    submittingRef.current = false

    if (res.status === 401) {
      router.push('/login')
      return
    }
    if (!res.ok) {
      setError(data.error)
      return
    }

    router.push(`/farms/${farmId}`)
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
        <div className="mb-5 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
            </svg>
            <span>Sem conexão — a retirada será salva localmente e sincronizada ao reconectar.</span>
          </div>
          {insumoCache.isStale(farmId) && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>Dados de estoque desatualizados (mais de 4h). Os valores exibidos podem não ser precisos.</span>
            </div>
          )}
        </div>
      )}

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

        {/* Talhão de destino + preview */}
        <div className="flex flex-col gap-2">
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

          {/* Preview do talhão selecionado */}
          {selectedTalhao && (
            <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 px-3 py-2.5 text-xs">
              <p className="mb-1.5 font-medium text-gray-400">{selectedTalhao.name} — situação atual</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span className="text-gray-500">
                  Área cadastrada:{' '}
                  <span className="text-gray-300">
                    {Number(selectedTalhao.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
                  </span>
                </span>
                {selectedTalhaoStat && selectedTalhaoStat.accumArea > 0 ? (
                  <>
                    <span className="text-gray-500">
                      {selectedInsumo ? `${selectedInsumo.title} — já aplicado:` : 'Já aplicado:'}{' '}
                      <span className="font-medium text-green-400">
                        {selectedTalhaoStat.accumArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
                      </span>
                    </span>
                    {selectedTalhaoStat.lastKgHa != null && (
                      <span className="text-gray-500">
                        Última taxa:{' '}
                        <span className="text-gray-300">
                          {selectedTalhaoStat.lastKgHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg/ha
                        </span>
                        {selectedTalhaoStat.lastDate && (
                          <span className="text-gray-600 ml-1">
                            ({new Date(selectedTalhaoStat.lastDate + 'T12:00:00').toLocaleDateString('pt-BR')})
                          </span>
                        )}
                      </span>
                    )}
                  </>
                ) : insumoId ? (
                  <span className="text-gray-600 italic">
                    {selectedInsumo ? `${selectedInsumo.title}: nenhuma aplicação neste talhão` : 'Nenhuma área registrada ainda'}
                  </span>
                ) : (
                  <span className="text-gray-600 italic">Selecione um insumo para ver o histórico</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quantidade */}
        <Input
          label="Quantidade (kg) *"
          type="number"
          min="0.001"
          step="0.001"
          max={selectedInsumo ? String(availableQty) : undefined}
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={undefined}
          required
          disabled={!insumoId}
        />

        {/* Área aplicada (opcional) */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-400">
            Área a ser aplicada
            <span className="ml-1.5 text-xs font-normal text-gray-600">(opcional — pode preencher após a operação)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={areaHa}
              onChange={(e) => setAreaHa(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-green-500/60 focus:outline-none"
            />
            <span className="shrink-0 text-sm text-gray-500">ha</span>
          </div>
          {/* Preview kg/ha se quantidade e área preenchidas */}
          {quantity && areaHa && Number(quantity) > 0 && parseFloat(areaHa.replace(',', '.')) > 0 && (
            <p className="text-xs text-gray-500">
              Taxa desta aplicação:{' '}
              <span className="font-medium text-green-400">
                {(Number(quantity) / parseFloat(areaHa.replace(',', '.'))).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg/ha
              </span>
            </p>
          )}
        </div>

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
          maxLength={1000}
        />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
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
