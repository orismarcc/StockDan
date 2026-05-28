'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Button } from './ui/Button'

interface Schedule {
  id?: string
  enabled: boolean
  frequency: 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  email: string
  format: 'pdf' | 'xlsx'
  sections: string[]
  window_days: number
  last_sent_at?: string | null
  last_status?: string | null
}

interface Props {
  initial: Schedule | null
  defaultEmail: string
}

const WEEKDAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

const SECTIONS = [
  { value: 'summary',      label: 'Resumo geral' },
  { value: 'transactions', label: 'Lista de transações' },
  { value: 'by_insumo',    label: 'Consumo por insumo' },
  { value: 'by_talhao',    label: 'Consumo por talhão' },
  { value: 'operators',    label: 'Desempenho dos operadores' },
]

export function ReportScheduleForm({ initial, defaultEmail }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Schedule>(() => initial ?? {
    enabled: false,
    frequency: 'monthly',
    day_of_week: 1,
    day_of_month: 1,
    email: defaultEmail,
    format: 'pdf',
    sections: ['summary', 'transactions', 'by_insumo'],
    window_days: 30,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  function update<K extends keyof Schedule>(k: K, v: Schedule[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function toggleSection(s: string) {
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(s) ? f.sections.filter((x) => x !== s) : [...f.sections, s],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    const res = await fetch('/api/reports/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error ?? 'Erro ao salvar.'); return }
    setSuccess(form.enabled ? 'Agendamento ativado e salvo.' : 'Configuração salva (envio desativado).')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Toggle */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-100">Receber relatórios automaticamente</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Quando ativado, o sistema envia um relatório do seu tenant na data configurada.
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="h-5 w-5 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500/30"
          />
        </label>
      </div>

      {/* Frequência */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Quando enviar</h2>
        <div className="flex flex-col gap-4">
          <Select
            label="Frequência"
            value={form.frequency}
            onChange={(e) => update('frequency', e.target.value as Schedule['frequency'])}
          >
            <option value="monthly">Mensal</option>
            <option value="weekly">Semanal</option>
          </Select>

          {form.frequency === 'weekly' ? (
            <Select
              label="Dia da semana"
              value={String(form.day_of_week ?? 1)}
              onChange={(e) => update('day_of_week', Number(e.target.value))}
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
          ) : (
            <Input
              label="Dia do mês (1-28)"
              type="number"
              min={1}
              max={28}
              value={String(form.day_of_month ?? 1)}
              onChange={(e) => update('day_of_month', Number(e.target.value))}
            />
          )}

          <Input
            label="Janela de dados (últimos N dias)"
            type="number"
            min={1}
            max={365}
            value={String(form.window_days)}
            onChange={(e) => update('window_days', Number(e.target.value))}
            hint="Quantos dias para trás incluir no relatório (ex: 30 = último mês)"
          />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Conteúdo do relatório</h2>
        <div className="flex flex-col gap-4">
          <Input
            label="Enviar para o e-mail"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />
          <Select
            label="Formato"
            value={form.format}
            onChange={(e) => update('format', e.target.value as Schedule['format'])}
          >
            <option value="pdf">PDF (para impressão)</option>
            <option value="xlsx">Excel (para análise)</option>
          </Select>
          <div>
            <p className="mb-2 text-sm text-gray-300">Seções incluídas:</p>
            <div className="space-y-2">
              {SECTIONS.map((s) => {
                const checked = form.sections.includes(s.value)
                return (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      checked ? 'border-green-500/30 bg-green-500/5' : 'border-gray-800 hover:bg-gray-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSection(s.value)}
                      className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500/30"
                    />
                    <span className="text-sm text-gray-200">{s.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Status do último envio */}
      {initial?.last_sent_at && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-xs text-gray-500">
          Último envio: {new Date(initial.last_sent_at).toLocaleString('pt-BR')}
          {initial.last_status && <span className="ml-2 text-gray-600">— {initial.last_status}</span>}
        </div>
      )}

      {error   && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      {success && <p className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-400">{success}</p>}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Salvar configuração</Button>
      </div>
    </form>
  )
}
