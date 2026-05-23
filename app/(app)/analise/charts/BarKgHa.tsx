// app/(app)/analise/charts/BarKgHa.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TxRow, TalhaoOption } from '../types'

interface Props {
  transactions: TxRow[]
  talhoes: TalhaoOption[]
}

export function BarKgHa({ transactions, talhoes }: Props) {
  const talhaoMap = Object.fromEntries(talhoes.map((t) => [t.id, t.name]))

  const byTalhao: Record<string, { qty: number; area: number }> = {}
  for (const t of transactions) {
    if (!t.talhao_id) continue
    if (!byTalhao[t.talhao_id]) byTalhao[t.talhao_id] = { qty: 0, area: 0 }
    byTalhao[t.talhao_id].qty += t.quantity
    if (t.area_ha != null && t.area_ha > 0) byTalhao[t.talhao_id].area += t.area_ha
  }

  const data = Object.entries(byTalhao)
    .filter(([, v]) => v.area > 0)
    .map(([id, { qty, area }]) => ({
      name: talhaoMap[id] ?? id,
      kgHa: Math.round((qty / area) * 10) / 10,
    }))
    .sort((a, b) => b.kgHa - a.kgHa)

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">kg/ha por Talhão</p>
        <div className="flex flex-1 items-center justify-center h-48">
          <p className="text-sm text-gray-700">Nenhuma área registrada no período</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">kg/ha por Talhão</p>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#d1d5db' }}
            itemStyle={{ color: '#3b82f6' }}
            formatter={(v) => {
              const num = typeof v === 'number' ? v : Number(v)
              return [`${num.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg/ha`, 'Taxa'] as [string, string]
            }}
          />
          <Bar dataKey="kgHa" fill="#3b82f6" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#6b7280', fontSize: 10 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
