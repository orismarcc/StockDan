// app/(app)/analise/ReportModal.tsx
'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { FilterState } from './AnaliseFilters'
import type { FarmOption, TalhaoOption } from './types'
import { getDateRange } from './AnaliseClient'

interface Props {
  open: boolean
  onClose: () => void
  filters: FilterState
  farms: FarmOption[]
  talhoes: TalhaoOption[]
}

const ALL_SECTIONS = [
  { id: 'summary',      label: 'Resumo geral (KPIs)' },
  { id: 'transactions', label: 'Listagem de aplicações' },
  { id: 'by_insumo',   label: 'Resumo por insumo' },
  { id: 'by_talhao',   label: 'Resumo por talhão' },
  { id: 'operators',   label: 'Desempenho dos operadores' },
]

export function ReportModal({ open, onClose, filters, farms, talhoes }: Props) {
  const [sections, setSections] = useState<string[]>(ALL_SECTIONS.map((s) => s.id))
  const [loading, setLoading] = useState<'pdf' | 'xlsx' | null>(null)

  function toggleSection(id: string) {
    setSections((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])
  }

  function buildUrl(format: 'pdf' | 'xlsx') {
    const { from, to } = getDateRange(filters)
    const params = new URLSearchParams({
      format,
      from,
      to,
      sections: sections.join(','),
    })
    if (filters.farmId) params.set('farm_id', filters.farmId)
    if (filters.talhaoIds.length > 0) params.set('talhao_ids', filters.talhaoIds.join(','))
    if (filters.insumoIds.length > 0) params.set('insumo_ids', filters.insumoIds.join(','))
    return `/api/analise/report?${params.toString()}`
  }

  async function handleDownload(format: 'pdf' | 'xlsx') {
    if (sections.length === 0) return
    setLoading(format)
    try {
      const url = buildUrl(format)
      const res = await fetch(url)
      if (!res.ok) { alert('Erro ao gerar relatório.'); return }
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `stockdan-relatorio.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      link.click()
      URL.revokeObjectURL(link.href)
      onClose()
    } finally {
      setLoading(null)
    }
  }

  // Preview info
  const { from, to } = getDateRange(filters)
  const farmName = filters.farmId ? (farms.find((f) => f.id === filters.farmId)?.name ?? '—') : 'Todas'
  const talhaoNames = filters.talhaoIds.length === 0
    ? 'Todos'
    : filters.talhaoIds.map((id) => talhoes.find((t) => t.id === id)?.name ?? id).join(', ')

  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

  return (
    <Modal open={open} onClose={onClose} title="Gerar Relatório" className="max-w-md">
      {/* Filter preview */}
      <div className="mb-5 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm">
        <p className="mb-1 text-xs text-gray-500 uppercase tracking-wider">Filtros aplicados</p>
        <div className="flex flex-col gap-1 text-gray-300">
          <span><span className="text-gray-500">Período:</span> {fmt(from)} — {fmt(to)}</span>
          <span><span className="text-gray-500">Fazenda:</span> {farmName}</span>
          <span className="truncate"><span className="text-gray-500">Talhões:</span> {talhaoNames}</span>
        </div>
      </div>

      {/* Section checkboxes */}
      <div className="mb-5">
        <p className="mb-2 text-xs text-gray-500 uppercase tracking-wider">Seções a incluir</p>
        <div className="flex flex-col gap-2">
          {ALL_SECTIONS.map(({ id, label }) => (
            <label key={id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-gray-800 transition-colors">
              <input
                type="checkbox"
                checked={sections.includes(id)}
                onChange={() => toggleSection(id)}
                className="accent-green-500 h-4 w-4"
              />
              <span className="text-sm text-gray-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {sections.length === 0 && (
        <p className="mb-4 text-xs text-amber-400">Selecione ao menos uma seção.</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => handleDownload('pdf')}
          disabled={sections.length === 0 || loading !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading === 'pdf' ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          )}
          PDF
        </button>
        <button
          onClick={() => handleDownload('xlsx')}
          disabled={sections.length === 0 || loading !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2.5 text-sm font-medium text-green-400 hover:bg-green-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading === 'xlsx' ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-9.75 0h9.75" />
            </svg>
          )}
          Excel
        </button>
      </div>
    </Modal>
  )
}
