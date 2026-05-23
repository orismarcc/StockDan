'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const [form, setForm] = useState<FormData>({ ...EMPTY, ...initialData })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEditing = Boolean(adjId)

  function set(name: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const url = isEditing
      ? `/api/farms/${farmId}/implement-adjustments/${adjId}`
      : `/api/farms/${farmId}/implement-adjustments`

    const res = await fetch(url, {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, talhao_id: talhaoId }),
    })

    setSaving(false)

    if (res.ok) {
      if (!isEditing) setForm(EMPTY)
      router.refresh()
      onSuccess?.()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erro ao salvar regulagem')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60 transition-colors"
        >
          {saving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Salvar Regulagem'}
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
