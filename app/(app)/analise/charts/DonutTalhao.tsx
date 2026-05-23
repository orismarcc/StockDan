// app/(app)/analise/charts/DonutTalhao.tsx
'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { TxRow, TalhaoOption } from '../types'

interface Props {
  transactions: TxRow[]
  talhoes: TalhaoOption[]
}

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6']

export function DonutTalhao({ transactions, talhoes }: Props) {
  const talhaoMap = Object.fromEntries(talhoes.map((t) => [t.id, t]))

  // Sum area_ha per talhão
  const areaByTalhao: Record<string, number> = {}
  for (const t of transactions) {
    if (t.talhao_id && t.area_ha != null && t.area_ha > 0) {
      areaByTalhao[t.talhao_id] = (areaByTalhao[t.talhao_id] ?? 0) + t.area_ha
    }
  }

  const data = Object.entries(areaByTalhao)
    .map(([id, areaApplied]) => {
      const talhao = talhaoMap[id]
      if (!talhao) return null
      const pct = Math.min(100, (areaApplied / talhao.area_ha) * 100)
      return { id, name: talhao.name, pct: Math.round(pct * 10) / 10, areaApplied, totalArea: talhao.area_ha }
    })
    .filter(Boolean) as { id: string; name: string; pct: number; areaApplied: number; totalArea: number }[]

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">% Área Coberta por Talhão</p>
        <div className="flex flex-1 items-center justify-center h-48">
          <p className="text-sm text-gray-700">Nenhuma área registrada no período</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">% Área Coberta por Talhão</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="pct"
            nameKey="name"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#d1d5db' }}
            formatter={(v, _name, props) => {
              const num = typeof v === 'number' ? v : Number(v)
              const p = (props as any)?.payload
              const areaApplied = p?.areaApplied ?? 0
              const totalArea = p?.totalArea ?? 0
              return [
                `${num}% (${areaApplied.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de ${totalArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha)`,
                'Cobertura'
              ] as [string, string]
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
            formatter={(value) => value}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
