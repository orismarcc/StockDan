// app/(app)/analise/AnaliseFilters.tsx
'use client'

import { cn } from '@/lib/utils'
import type { FarmOption, TalhaoOption, InsumoOption } from './types'

export type Period = 'today' | '7d' | '30d' | 'month' | 'custom'

export interface FilterState {
  period: Period
  customFrom: string
  customTo: string
  farmId: string
  talhaoIds: string[]
  insumoIds: string[]
}

interface Props {
  farms: FarmOption[]
  talhoes: TalhaoOption[]
  insumos: InsumoOption[]
  filters: FilterState
  onChange: (f: FilterState) => void
  onOpenReport: () => void
}

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'custom', label: 'Período' },
]

export function AnaliseFilters({ farms, talhoes, insumos, filters, onChange, onOpenReport }: Props) {
  const visibleTalhoes = filters.farmId
    ? talhoes.filter((t) => t.farm_id === filters.farmId)
    : talhoes

  const visibleInsumos = filters.farmId
    ? insumos.filter((i) => i.farm_id === filters.farmId)
    : insumos

  function toggleMulti(ids: string[], id: string): string[] {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  }

  return (
    <aside className="flex w-full flex-col gap-5 lg:w-64 lg:flex-shrink-0">
      {/* Período */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Período</p>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onChange({ ...filters, period: key })}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filters.period === key
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {filters.period === 'custom' && (
          <div className="mt-2 flex flex-col gap-1.5">
            <input
              type="date"
              value={filters.customFrom}
              onChange={(e) => onChange({ ...filters, customFrom: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-100 focus:border-green-500/60 focus:outline-none"
            />
            <input
              type="date"
              value={filters.customTo}
              onChange={(e) => onChange({ ...filters, customTo: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-100 focus:border-green-500/60 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Fazenda */}
      {farms.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Fazenda</p>
          <select
            value={filters.farmId}
            onChange={(e) => onChange({ ...filters, farmId: e.target.value, talhaoIds: [], insumoIds: [] })}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-100 focus:border-green-500/60 focus:outline-none"
          >
            <option value="">Todas as fazendas</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Talhões */}
      {visibleTalhoes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Talhões</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {visibleTalhoes.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={filters.talhaoIds.includes(t.id)}
                  onChange={() => onChange({ ...filters, talhaoIds: toggleMulti(filters.talhaoIds, t.id) })}
                  className="accent-green-500"
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Insumos */}
      {visibleInsumos.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Insumos</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {visibleInsumos.map((i) => (
              <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={filters.insumoIds.includes(i.id)}
                  onChange={() => onChange({ ...filters, insumoIds: toggleMulti(filters.insumoIds, i.id) })}
                  className="accent-green-500"
                />
                {i.title}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Botão relatório */}
      <div className="mt-auto pt-2">
        <button
          onClick={onOpenReport}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2.5 text-sm font-medium text-green-400 hover:bg-green-600/20 hover:border-green-500/50 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Gerar Relatório
        </button>
      </div>
    </aside>
  )
}
