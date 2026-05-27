'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useFormDraft } from '@/hooks/useFormDraft'
import { mutationQueue } from '@/lib/mutationQueue'

interface ImplementAdjustmentFormProps {
  farmId: string
  talhaoId: string
  /** Quando informado, o formulário opera em modo edição (PATCH) */
  adjId?: string
  initialData?: Partial<FormData>
  onSuccess?: () => void
  onCancel?: () => void
}

interface FormData {
  implemento: string
  taxa_kgha: string
  palhetas: string
  rpm_maquina: string
  rpm_pratos_eixo: string
  num_bandejas: string
  espacamento_bandejas: string
  cv_percent: string
  faixa_aplicacao: string
  comporta: string
}

const EMPTY: FormData = {
  implemento: '',
  taxa_kgha: '',
  palhetas: '',
  rpm_maquina: '',
  rpm_pratos_eixo: '',
  num_bandejas: '',
  espacamento_bandejas: '',
  cv_percent: '',
  faixa_aplicacao: '',
  comporta: '',
}

function Field({
  label,
  unit,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  step,
}: {
  label: string
  unit?: string
  name: keyof FormData
  value: string
  onChange: (name: keyof FormData, v: string) => void
  type?: string
  placeholder?: string
  step?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-400">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder ?? '—'}
          className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-green-500/60 focus:outline-none"
        />
        {unit && <span className="shrink-0 text-xs text-gray-500 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  )
}

export function ImplementAdjustmentForm({
  farmId,
  talhaoId,
  adjId,
  initialData,
  onSuccess,
  onCancel,
}: ImplementAdjustmentFormProps) {
  const router   = useRouter()
  const isOnline = useOnlineStatus()

  // Draft: nova regulagem usa draft localStorage. Edicao nao (initialData ja
  // carrega da regulagem existente — confundir com draft pode sobrescrever
  // edicao com nova-criacao abandonada).
  const isEditing = Boolean(adjId)
  const draftKey = `regulagem_${farmId}_${talhaoId}`
  const draft = useFormDraft<FormData>(draftKey, { ...EMPTY, ...initialData })
  const [form, setForm] = useState<FormData>(
    isEditing ? { ...EMPTY, ...initialData } : draft.state
  )
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [offlineOk, setOfflineOk] = useState(false)

  function set(name: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [name]: value }
      if (!isEditing) draft.setState(next)  // auto-save apenas em nova
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setOfflineOk(false)

    const payload = { ...form, talhao_id: talhaoId }

    // ── Offline: enfileira mutacao ──────────────────────────────────────────
    if (!isOnline) {
      try {
        mutationQueue.add({
          entity: 'implement_adjustment',
          op: isEditing ? 'PATCH' : 'POST',
          endpoint: isEditing
            ? `/api/farms/${farmId}/implement-adjustments/${adjId}`
            : `/api/farms/${farmId}/implement-adjustments`,
          payload,
          target_id: adjId,
        })
        setSaving(false)
        setOfflineOk(true)
        if (!isEditing) { setForm(EMPTY); draft.clear() }
        // Aviso ao usuario por 2.5s antes de fechar
        setTimeout(() => { onSuccess?.(); router.refresh() }, 2500)
      } catch (e) {
        setSaving(false)
        if (e instanceof Error && e.message === 'STORAGE_FULL') {
          setError('Armazenamento local cheio. Conecte-se à internet ou libere espaço no dispositivo.')
        } else {
          setError('Falha ao salvar localmente. Tente novamente.')
        }
      }
      return
    }

    // ── Online: envia direto, mas com offline_id para idempotencia ────────
    const url = isEditing
      ? `/api/farms/${farmId}/implement-adjustments/${adjId}`
      : `/api/farms/${farmId}/implement-adjustments`

    // Gera offline_id mesmo online — protege contra timeout/retry do navegador
    // (se requisicao timeout mas chegou ao servidor, retentar nao duplica)
    const offline_id = isEditing ? undefined : crypto.randomUUID()
    const updated_at_client = new Date().toISOString()

    const res = await fetch(url, {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, offline_id, updated_at_client }),
    })

    setSaving(false)

    if (res.ok) {
      // Detecta resolucao de conflito server-wins (PATCH com updated_at_client antigo)
      if (res.headers.get('X-Conflict-Resolution') === 'server-wins') {
        setError('Outro usuário já alterou esta regulagem. Recarregando os dados mais recentes.')
        setTimeout(() => { router.refresh(); onSuccess?.() }, 2000)
        return
      }
      if (!isEditing) { setForm(EMPTY); draft.clear() }
      router.refresh()
      onSuccess?.()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erro ao salvar regulagem')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!isOnline && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
          </svg>
          <span>Sem conexão — a regulagem será salva localmente e sincronizada ao reconectar.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Implemento" name="implemento" value={form.implemento} onChange={set} placeholder="Ex: Distribuidora centrífuga" />
        </div>

        <Field label="Taxa a ser aplicada" unit="kg/ha" name="taxa_kgha" value={form.taxa_kgha} onChange={set} type="number" step="0.01" placeholder="0,00" />
        <Field label="Palhetas" name="palhetas" value={form.palhetas} onChange={set} placeholder="Ex: 4 palhetas por disco" />

        <Field label="RPM Máquina" unit="rpm" name="rpm_maquina" value={form.rpm_maquina} onChange={set} type="number" step="1" placeholder="0" />
        <Field label="RPM Pratos / Eixo" unit="rpm" name="rpm_pratos_eixo" value={form.rpm_pratos_eixo} onChange={set} type="number" step="1" placeholder="0" />

        <Field label="Nº de Bandejas" name="num_bandejas" value={form.num_bandejas} onChange={set} type="number" step="1" placeholder="0" />
        <Field label="Espaçamento entre Bandejas" name="espacamento_bandejas" value={form.espacamento_bandejas} onChange={set} placeholder="Ex: 0,45 m" />

        <Field label="Coeficiente de Variação (CV%)" unit="%" name="cv_percent" value={form.cv_percent} onChange={set} type="number" step="0.01" placeholder="0,00" />
        <Field label="Faixa de Aplicação" name="faixa_aplicacao" value={form.faixa_aplicacao} onChange={set} placeholder="Ex: 12 m" />

        <div className="sm:col-span-2">
          <Field label="Comporta" name="comporta" value={form.comporta} onChange={set} placeholder="Ex: Posição 3 — abertura 45mm" />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      )}
      {offlineOk && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-400 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Regulagem salva offline. Será enviada ao servidor ao reconectar.</span>
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
        >
          {saving ? 'Salvando...' : isEditing ? (isOnline ? 'Salvar Alterações' : 'Salvar Offline') : (isOnline ? 'Salvar Regulagem' : 'Salvar Offline')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
