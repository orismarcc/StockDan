// app/(app)/analise/charts/BarInsumo.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type { TxRow, InsumoOption } from '../types'

interface Props {
  transactions: TxRow[]
  insumos: InsumoOption[]
}

const COLORS = ['#22c55e', '#16a34a', '#15803d', '#166534', '#14532d']

export function BarInsumo({ transactions, insumos }: Props) {
  const insumoMap = Object.fromEntries(insumos.map((i) => [i.id, i.title]))

  const grouped: Record<string, number> = {}
  for (const t of transactions) {
    grouped[t.insumo_id] = (grouped[t.insumo_id] ?? 0) + t.quantity
  }

  const data = Object.entries(grouped)
    .map(([id, kg]) => ({ name: insumoMap[id] ?? id, kg }))
    .sort((a, b) => b.kg - a.kg)

  if (data.length === 0) {
    return <Empty label="kg por insumo" />
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">kg Aplicado por Insumo</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#d1d5db' }}
            itemStyle={{ color: '#22c55e' }}
            formatter={(v) => {
              const num = typeof v === 'number' ? v : Number(v)
              return [`${num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`, 'Total'] as [string, string]
            }}
          />
          <Bar dataKey="kg" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="flex flex-1 items-center justify-center h-48">
        <p className="text-sm text-gray-700">Sem dados no período</p>
      </div>
    </div>
  )
}
