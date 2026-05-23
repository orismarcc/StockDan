// app/(app)/analise/KpiCards.tsx
'use client'

import type { TxRow } from './types'

interface KpiCardsProps {
  transactions: TxRow[]
}

export function KpiCards({ transactions }: KpiCardsProps) {
  const count      = transactions.length
  const totalKg    = transactions.reduce((s, t) => s + t.quantity, 0)
  const areaHaTxs  = transactions.filter((t) => t.area_ha != null && t.area_ha > 0)
  const totalArea  = areaHaTxs.reduce((s, t) => s + (t.area_ha ?? 0), 0)
  const avgKgHa    = totalArea > 0 ? totalKg / totalArea : null

  const cards = [
    {
      label: 'Aplicações',
      value: count.toString(),
      sub: 'registros no período',
      color: 'text-gray-100',
    },
    {
      label: 'Total aplicado',
      value: totalKg > 0
        ? totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' kg'
        : '—',
      sub: 'quantidade total',
      color: 'text-green-400',
    },
    {
      label: 'Área trabalhada',
      value: totalArea > 0
        ? totalArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha'
        : '—',
      sub: 'hectares registrados',
      color: 'text-blue-400',
    },
    {
      label: 'Taxa média',
      value: avgKgHa != null
        ? avgKgHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg/ha'
        : '—',
      sub: 'kg por hectare',
      color: 'text-amber-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, sub, color }) => (
        <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          <p className="mt-0.5 text-xs text-gray-600">{sub}</p>
        </div>
      ))}
    </div>
  )
}
