// app/(app)/analise/AnaliseClient.tsx
'use client'

import { useState, useMemo } from 'react'
import { AnaliseFilters, type FilterState } from './AnaliseFilters'
import type { AnaliseData, TxRow } from './types'
import { KpiCards } from './KpiCards'
import { BarInsumo } from './charts/BarInsumo'
import { AreaTempo } from './charts/AreaTempo'
import { DonutTalhao } from './charts/DonutTalhao'
import { BarKgHa } from './charts/BarKgHa'

function todayISO() { return new Date().toISOString().split('T')[0] }
function startOfMonthISO() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().split('T')[0]
}

export function getDateRange(filters: FilterState): { from: string; to: string } {
  const today = todayISO()
  switch (filters.period) {
    case 'today':  return { from: today, to: today }
    case '7d': {
      const d = new Date(); d.setDate(d.getDate() - 6)
      return { from: d.toISOString().split('T')[0], to: today }
    }
    case '30d': {
      const d = new Date(); d.setDate(d.getDate() - 29)
      return { from: d.toISOString().split('T')[0], to: today }
    }
    case 'month': return { from: startOfMonthISO(), to: today }
    case 'custom': return { from: filters.customFrom, to: filters.customTo }
  }
}

export function filterTransactions(txs: TxRow[], filters: FilterState): TxRow[] {
  const { from, to } = getDateRange(filters)
  return txs.filter((t) => {
    if (filters.farmId && t.farm_id !== filters.farmId) return false
    if (filters.talhaoIds.length > 0 && (!t.talhao_id || !filters.talhaoIds.includes(t.talhao_id))) return false
    if (filters.insumoIds.length > 0 && !filters.insumoIds.includes(t.insumo_id)) return false
    if (t.date < from || t.date > to) return false
    return true
  })
}

export function AnaliseClient({ data }: { data: AnaliseData }) {
  const [filters, setFilters] = useState<FilterState>({
    period: 'month',
    customFrom: startOfMonthISO(),
    customTo: todayISO(),
    farmId: data.farms.length === 1 ? data.farms[0].id : '',
    talhaoIds: [],
    insumoIds: [],
  })
  const [reportOpen, setReportOpen] = useState(false)

  const filtered = useMemo(() => filterTransactions(data.transactions, filters), [data.transactions, filters])

  if (data.farms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-medium text-gray-400">Nenhuma fazenda disponível para análise.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Análise</h1>
        <p className="mt-1 text-sm text-gray-500">Estatísticas e relatórios de aplicações</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Sidebar de filtros */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <AnaliseFilters
            farms={data.farms}
            talhoes={data.talhoes}
            insumos={data.insumos}
            filters={filters}
            onChange={setFilters}
            onOpenReport={() => setReportOpen(true)}
          />
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <KpiCards transactions={filtered} />

          <div className="grid gap-4 sm:grid-cols-2">
            <BarInsumo transactions={filtered} insumos={data.insumos} />
            <AreaTempo transactions={filtered} />
            <DonutTalhao transactions={filtered} talhoes={data.talhoes} />
            <BarKgHa transactions={filtered} talhoes={data.talhoes} />
          </div>

          {/* Operadores placeholder — Task 10 */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-700">Operadores</p>
          </div>
        </div>
      </div>

      {/* Report modal placeholder — Task 11 */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setReportOpen(false)}>
          <div className="rounded-xl bg-gray-900 border border-gray-700 p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-gray-300">Modal de relatório — em construção</p>
          </div>
        </div>
      )}
    </div>
  )
}
