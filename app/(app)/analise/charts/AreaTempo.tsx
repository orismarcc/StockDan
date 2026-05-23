// app/(app)/analise/charts/AreaTempo.tsx
'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TxRow } from '../types'

interface Props {
  transactions: TxRow[]
}

export function AreaTempo({ transactions }: Props) {
  // Group by date, sum quantity
  const grouped: Record<string, number> = {}
  for (const t of transactions) {
    grouped[t.date] = (grouped[t.date] ?? 0) + t.quantity
  }

  const data = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kg]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      kg,
    }))

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Aplicações no Tempo</p>
        <div className="flex flex-1 items-center justify-center h-48">
          <p className="text-sm text-gray-700">Sem dados no período</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Aplicações no Tempo</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#d1d5db' }}
            itemStyle={{ color: '#22c55e' }}
            formatter={(v) => {
              const num = typeof v === 'number' ? v : Number(v)
              return [`${num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`, 'kg aplicado'] as [string, string]
            }}
          />
          <Area
            type="monotone"
            dataKey="kg"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#areaGrad)"
            dot={data.length <= 15 ? { r: 3, fill: '#22c55e' } : false}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
