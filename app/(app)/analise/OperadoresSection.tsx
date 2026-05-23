// app/(app)/analise/OperadoresSection.tsx
'use client'

import { useState } from 'react'
import type { TxRow, OperatorOption, InsumoOption } from './types'

interface Props {
  transactions: TxRow[]
  operators: OperatorOption[]
  insumos: InsumoOption[]
  currentUserRole: 'admin' | 'operario'
}

interface OperatorStats {
  id: string
  name: string
  count: number
  areaTotal: number
  areaMedia: number
  kgTotal: number
  byInsumo: { title: string; kg: number }[]
}

const MEDALS = ['🥇', '🥈', '🥉']

export function OperadoresSection({ transactions, operators, insumos, currentUserRole }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const insumoMap = Object.fromEntries(insumos.map((i) => [i.id, i.title]))
  const operatorMap = Object.fromEntries(operators.map((o) => [o.id, o.name]))

  // Group transactions by user_id
  const byUser: Record<string, { txs: TxRow[] }> = {}
  for (const t of transactions) {
    const uid = t.user_id ?? '__unknown__'
    if (!byUser[uid]) byUser[uid] = { txs: [] }
    byUser[uid].txs.push(t)
  }

  const stats: OperatorStats[] = Object.entries(byUser).map(([uid, { txs }]) => {
    const areaHaTxs = txs.filter((t) => t.area_ha != null && t.area_ha > 0)
    const areaTotal = areaHaTxs.reduce((s, t) => s + (t.area_ha ?? 0), 0)
    const kgTotal   = txs.reduce((s, t) => s + t.quantity, 0)

    const insumoGroups: Record<string, number> = {}
    for (const t of txs) {
      insumoGroups[t.insumo_id] = (insumoGroups[t.insumo_id] ?? 0) + t.quantity
    }
    const byInsumo = Object.entries(insumoGroups)
      .map(([id, kg]) => ({ title: insumoMap[id] ?? id, kg }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 5)

    return {
      id: uid,
      name: operatorMap[uid] ?? 'Desconhecido',
      count: txs.length,
      areaTotal,
      areaMedia: areaHaTxs.length > 0 ? areaTotal / areaHaTxs.length : 0,
      kgTotal,
      byInsumo,
    }
  }).sort((a, b) => b.areaTotal - a.areaTotal)

  const maxArea = stats[0]?.areaTotal ?? 1

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
        {currentUserRole === 'admin' ? 'Desempenho dos Operadores' : 'Meu Desempenho'}
      </h2>

      {stats.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhum registro com operador identificado no período.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {stats.map((op, i) => (
            <div key={op.id} className="rounded-lg border border-gray-800 bg-gray-800/30 overflow-hidden">
              {/* Header row */}
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                onClick={() => setExpanded(expanded === op.id ? null : op.id)}
              >
                {currentUserRole === 'admin' && i < 3 && (
                  <span className="text-lg shrink-0">{MEDALS[i]}</span>
                )}
                {/* Avatar */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-xs font-bold text-green-400">
                  {op.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{op.name}</p>
                  <p className="text-xs text-gray-500">{op.count} registro{op.count !== 1 ? 's' : ''}</p>
                </div>
                {/* Metrics */}
                <div className="hidden sm:flex gap-5 text-right">
                  <div>
                    <p className="text-sm font-semibold text-green-400">
                      {op.areaTotal > 0
                        ? op.areaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha'
                        : '—'}
                    </p>
                    <p className="text-xs text-gray-600">área total</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-300">
                      {op.areaMedia > 0
                        ? op.areaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha'
                        : '—'}
                    </p>
                    <p className="text-xs text-gray-600">média/reg.</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-400">
                      {op.kgTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg
                    </p>
                    <p className="text-xs text-gray-600">total kg</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="hidden lg:block w-24">
                  <div className="h-1.5 w-full rounded-full bg-gray-700">
                    <div
                      className="h-1.5 rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(100, (op.areaTotal / maxArea) * 100)}%` }}
                    />
                  </div>
                </div>
                {/* Chevron */}
                <svg
                  className={`h-4 w-4 shrink-0 text-gray-600 transition-transform ${expanded === op.id ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded: by insumo */}
              {expanded === op.id && op.byInsumo.length > 0 && (
                <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/60">
                  <p className="mb-2 text-xs text-gray-500 uppercase tracking-wider">Por insumo</p>
                  <div className="flex flex-col gap-2">
                    {op.byInsumo.map(({ title, kg }) => {
                      const maxKg = op.byInsumo[0]?.kg ?? 1
                      return (
                        <div key={title} className="flex items-center gap-3">
                          <span className="w-28 truncate text-xs text-gray-400">{title}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-700">
                            <div
                              className="h-1.5 rounded-full bg-blue-500"
                              style={{ width: `${(kg / maxKg) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-20 text-right">
                            {kg.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
