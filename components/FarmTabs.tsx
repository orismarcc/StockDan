'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn, formatQuantity } from '@/lib/utils'
import { StockBadge } from './StockBadge'
import { TransactionTable, Transaction } from './TransactionTable'
import { AddStockModal } from './AddStockModal'
import { EditTransactionModal } from './EditTransactionModal'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'
import { RegulagemModal } from './RegulagemModal'
import { Button } from './ui/Button'

type TabId = 'talhoes' | 'insumos' | 'historico'

interface Talhao {
  id: string
  name: string
  area_ha: number
}

interface FarmTabsProps {
  farm: { id: string; name: string }
  insumos: any[]
  talhoes: Talhao[]
  transactions: Transaction[]
  userRole: 'admin' | 'operario'
  userId: string
}

export function FarmTabs({ farm, insumos, talhoes, transactions, userRole }: FarmTabsProps) {
  const [tab, setTab] = useState<TabId>('talhoes')
  const [addStockFor, setAddStockFor] = useState<{ id: string; title: string; unit: string } | null>(null)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [editQtyFor, setEditQtyFor] = useState<{ id: string; title: string; unit: string; currentQty: number } | null>(null)
  const [regulagemFor, setRegulagemFor] = useState<{ id: string; name: string } | null>(null)
  const router = useRouter()

  const handleRouterRefresh = useCallback(() => router.refresh(), [router])

  // Área acumulada por insumo por talhão
  const talhaoInsumoStats = useMemo(() => {
    const result: Record<string, Record<string, { accumArea: number; totalQtyKg: number; txCount: number }>> = {}
    for (const tx of transactions) {
      if (tx.type !== 'saida' || !tx.talhoes?.id || !tx.insumos) continue
      const tid = tx.talhoes.id
      const insumoTitle = tx.insumos.title
      const qty = Number(tx.quantity)
      const qtyKg = qty
      const areaHa = (tx as any).area_ha != null && Number((tx as any).area_ha) > 0
        ? Number((tx as any).area_ha) : 0
      if (!result[tid]) result[tid] = {}
      if (!result[tid][insumoTitle]) result[tid][insumoTitle] = { accumArea: 0, totalQtyKg: 0, txCount: 0 }
      result[tid][insumoTitle].accumArea += areaHa
      result[tid][insumoTitle].totalQtyKg += qtyKg
      result[tid][insumoTitle].txCount += 1
    }
    return result
  }, [transactions])

  // Top 3 insumos mais usados (por nº de transações) na fazenda
  const topInsumos = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tx of transactions) {
      if (tx.type !== 'saida' || !tx.insumos) continue
      counts[tx.insumos.title] = (counts[tx.insumos.title] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([title]) => title)
  }, [transactions])

  const tabs: { id: TabId; label: string; count?: number }[] = useMemo(() => [
    { id: 'talhoes',   label: 'Talhões',   count: talhoes.length },
    { id: 'insumos',   label: 'Insumos',   count: insumos.length },
    { id: 'historico', label: 'Histórico', count: transactions.length },
  ], [talhoes.length, insumos.length, transactions.length])

  return (
    <>
      {/* Tab nav */}
      <div className="mb-6 flex gap-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-md px-2 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-gray-800 text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
                tab === t.id ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-600'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Talhões ──────────────────────────────────────────────────────── */}
      {tab === 'talhoes' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{talhoes.length} talhão(ões) cadastrado(s)</p>
            {userRole === 'admin' && (
              <Link href={`/farms/${farm.id}/talhoes`}>
                <Button size="sm">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  Gerenciar Talhões
                </Button>
              </Link>
            )}
          </div>

          {talhoes.length === 0 ? (
            <EmptyState
              icon="map"
              message="Nenhum talhão cadastrado"
              action={userRole === 'admin' ? { label: 'Gerenciar talhões', href: `/farms/${farm.id}/talhoes` } : undefined}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm" style={{ minWidth: topInsumos.length > 0 ? `${640 + topInsumos.length * 130}px` : '560px' }}>
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Talhão</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Área (ha)</th>
                      {topInsumos.map((ins) => (
                        <th key={ins} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500" style={{ minWidth: '130px' }}>
                          <span className="text-green-500/70 truncate block max-w-[120px]" title={`% ${ins}`}>% {ins}</span>
                        </th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {talhoes.map((t) => (
                      <TalhaoRow
                        key={t.id}
                        talhao={t}
                        farmId={farm.id}
                        insumoStats={talhaoInsumoStats[t.id] ?? {}}
                        topInsumos={topInsumos}
                        userRole={userRole}
                        onDeleted={handleRouterRefresh}
                        onRegulagem={() => setRegulagemFor({ id: t.id, name: t.name })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="flex flex-col gap-3 sm:hidden">
                {talhoes.map((t) => (
                  <TalhaoCard
                    key={t.id}
                    talhao={t}
                    farmId={farm.id}
                    insumoStats={talhaoInsumoStats[t.id] ?? {}}
                    topInsumos={topInsumos}
                    userRole={userRole}
                    onDeleted={() => router.refresh()}
                    onRegulagem={() => setRegulagemFor({ id: t.id, name: t.name })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Insumos ──────────────────────────────────────────────────────── */}
      {tab === 'insumos' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">
              {insumos.length} insumo{insumos.length !== 1 ? 's' : ''} cadastrado{insumos.length !== 1 ? 's' : ''}
            </p>
            {userRole === 'admin' && (
              <Link href={`/farms/${farm.id}/insumos/new`}>
                <Button size="sm">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  Novo Insumo
                </Button>
              </Link>
            )}
          </div>

          {insumos.length === 0 ? (
            <EmptyState
              icon="box"
              message="Nenhum insumo cadastrado"
              action={userRole === 'admin' ? { label: 'Cadastrar insumo', href: `/farms/${farm.id}/insumos/new` } : undefined}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm" style={{ minWidth: '560px' }}>
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Insumo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Unidade</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Estoque</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insumos.map((ins) => (
                      <InsumoRow
                        key={ins.id}
                        ins={ins}
                        farmId={farm.id}
                        userRole={userRole}
                        onAddStock={() => setAddStockFor({ id: ins.id, title: ins.title, unit: ins.unit })}
                        onEditQty={() => setEditQtyFor({ id: ins.id, title: ins.title, unit: ins.unit, currentQty: ins.quantity })}
                        onDeleted={handleRouterRefresh}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="flex flex-col gap-3 sm:hidden">
                {insumos.map((ins) => (
                  <InsumoCard
                    key={ins.id}
                    ins={ins}
                    farmId={farm.id}
                    userRole={userRole}
                    onAddStock={() => setAddStockFor({ id: ins.id, title: ins.title, unit: ins.unit })}
                    onEditQty={() => setEditQtyFor({ id: ins.id, title: ins.title, unit: ins.unit, currentQty: ins.quantity })}
                    onDeleted={() => router.refresh()}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Histórico ────────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <TransactionTable
            transactions={transactions}
            showInsumo
            farmId={farm.id}
            userRole={userRole}
            talhoes={talhoes}
            onEdit={(tx) => setEditTx(tx)}
            onDelete={() => router.refresh()}
          />
        </div>
      )}

      {regulagemFor && (
        <RegulagemModal
          farmId={farm.id}
          talhaoId={regulagemFor.id}
          talhaoName={regulagemFor.name}
          onClose={() => { setRegulagemFor(null); router.refresh() }}
        />
      )}

      {addStockFor && (
        <AddStockModal
          farmId={farm.id}
          insumoId={addStockFor.id}
          insumoTitle={addStockFor.title}
          unit={addStockFor.unit}
          onClose={() => setAddStockFor(null)}
          onSuccess={() => { setAddStockFor(null); router.refresh() }}
        />
      )}

      {editQtyFor && (
        <AdjustQuantityModal
          farmId={farm.id}
          insumoId={editQtyFor.id}
          insumoTitle={editQtyFor.title}
          unit={editQtyFor.unit}
          currentQty={editQtyFor.currentQty}
          onClose={() => setEditQtyFor(null)}
          onSuccess={() => { setEditQtyFor(null); router.refresh() }}
        />
      )}

      {editTx && (
        <EditTransactionModal
          farmId={farm.id}
          transaction={editTx}
          talhoes={talhoes}
          onClose={() => setEditTx(null)}
          onSuccess={() => { setEditTx(null); router.refresh() }}
        />
      )}
    </>
  )
}

// ─── TalhaoRow (desktop) ─────────────────────────────────────────────────────

function pctBarColor(pct: number) {
  return pct >= 100 ? 'bg-blue-500' : pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-orange-500'
}
function pctTextColor(pct: number) {
  return pct >= 100 ? 'text-blue-400' : pct >= 75 ? 'text-green-400' : pct >= 40 ? 'text-yellow-400' : 'text-orange-400'
}

const TalhaoRow = memo(function TalhaoRow({
  talhao: t,
  farmId,
  insumoStats,
  topInsumos,
  userRole,
  onDeleted,
  onRegulagem,
}: {
  talhao: Talhao
  farmId: string
  insumoStats: Record<string, { accumArea: number; totalQtyKg: number; txCount: number }>
  topInsumos: string[]
  userRole: 'admin' | 'operario'
  onDeleted: () => void
  onRegulagem: () => void
}) {
  const areaHa = Number(t.area_ha)

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/farms/${farmId}/talhoes/${t.id}`} className="font-medium text-gray-200 hover:text-green-400 transition-colors">
          {t.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-right font-mono text-gray-400 whitespace-nowrap">
        {areaHa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </td>
      {topInsumos.map((insumoTitle) => {
        const stat = insumoStats[insumoTitle]
        const pct = stat && areaHa > 0 && stat.accumArea > 0
          ? Math.min(100, (stat.accumArea / areaHa) * 100)
          : null
        return (
          <td key={insumoTitle} className="px-4 py-3" style={{ minWidth: '130px' }}>
            {pct != null ? (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 flex-1 rounded-full bg-gray-800 overflow-hidden">
                  <div className={cn('h-full rounded-full', pctBarColor(pct))} style={{ width: `${pct}%` }} />
                </div>
                <span className={cn('text-xs font-medium tabular-nums shrink-0 w-10 text-right', pctTextColor(pct))}>
                  {pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </span>
              </div>
            ) : (
              <span className="text-xs text-gray-700">—</span>
            )}
          </td>
        )
      })}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/farms/${farmId}/retirada?talhao=${t.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-green-600/30 bg-green-600/10 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-600/20 transition-colors"
          >
            + Aplicação
          </Link>
          <button
            onClick={onRegulagem}
            className="inline-flex items-center gap-1 rounded-md border border-blue-600/30 bg-blue-600/10 px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/50 transition-colors"
          >
            + Regulagem
          </button>
          <Link
            href={`/farms/${farmId}/talhoes/${t.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            Detalhes
          </Link>
          {userRole === 'admin' && (
            <ConfirmDeleteButton
              onConfirm={async () => {
                const res = await fetch(`/api/farms/${farmId}/talhoes/${t.id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error('Falha ao apagar talhão')
                onDeleted()
              }}
            />
          )}
        </div>
      </td>
    </tr>
  )
})

// ─── TalhaoCard (mobile) ─────────────────────────────────────────────────────

const TalhaoCard = memo(function TalhaoCard({
  talhao: t,
  farmId,
  insumoStats,
  topInsumos,
  userRole,
  onDeleted,
  onRegulagem,
}: {
  talhao: Talhao
  farmId: string
  insumoStats: Record<string, { accumArea: number; totalQtyKg: number; txCount: number }>
  topInsumos: string[]
  userRole: 'admin' | 'operario'
  onDeleted: () => void
  onRegulagem: () => void
}) {
  const areaHa = Number(t.area_ha)

  // Per-insumo % for this talhão
  const insumoPercentages = topInsumos
    .map((title) => {
      const stat = insumoStats[title]
      if (!stat || areaHa <= 0 || stat.accumArea <= 0) return null
      const pct = Math.min(100, (stat.accumArea / areaHa) * 100)
      return { title, pct }
    })
    .filter(Boolean) as { title: string; pct: number }[]

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/farms/${farmId}/talhoes/${t.id}`} className="text-base font-semibold text-gray-100 hover:text-green-400 transition-colors">
            {t.name}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">
            {areaHa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha cadastrados
          </p>
        </div>
      </div>

      {/* Per-insumo percentages */}
      {insumoPercentages.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {insumoPercentages.map(({ title, pct }) => (
            <div key={title} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{title}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-800">
                  <div className={cn('h-full rounded-full', pctBarColor(pct))} style={{ width: `${pct}%` }} />
                </div>
                <span className={cn('w-10 text-right text-xs font-medium tabular-nums', pctTextColor(pct))}>
                  {pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {/* Linha 1: + Aplicação | + Regulagem */}
        <div className="flex items-center gap-2">
          <Link
            href={`/farms/${farmId}/retirada?talhao=${t.id}`}
            className="flex-1 rounded-lg border border-green-600/30 bg-green-600/10 py-2.5 text-center text-sm font-medium text-green-400 hover:bg-green-600/20 transition-colors"
          >
            + Aplicação
          </Link>
          <button
            onClick={onRegulagem}
            className="flex-1 rounded-lg border border-blue-600/30 bg-blue-600/10 py-2.5 text-center text-sm font-medium text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/50 transition-colors"
          >
            + Regulagem
          </button>
        </div>
        {/* Linha 2: Detalhes (largura total) + delete */}
        <div className="flex items-center gap-2">
          <Link
            href={`/farms/${farmId}/talhoes/${t.id}`}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800/60 py-2.5 text-center text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            Detalhes
          </Link>
          {userRole === 'admin' && (
            <ConfirmDeleteButton
              onConfirm={async () => {
                const res = await fetch(`/api/farms/${farmId}/talhoes/${t.id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error('Falha ao apagar talhão')
                onDeleted()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
})

// ─── InsumoRow (desktop) ─────────────────────────────────────────────────────

const InsumoRow = memo(function InsumoRow({
  ins,
  farmId,
  userRole,
  onAddStock,
  onEditQty,
  onDeleted,
}: {
  ins: any
  farmId: string
  userRole: 'admin' | 'operario'
  onAddStock: () => void
  onEditQty: () => void
  onDeleted: () => void
}) {
  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/farms/${farmId}/insumos/${ins.id}`} className="font-medium text-gray-200 hover:text-green-400 transition-colors">
          {ins.title}
        </Link>
        {ins.description && (
          <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[200px]">{ins.description}</p>
        )}
      </td>
      <td className="px-4 py-3 text-gray-400 uppercase text-xs">{ins.unit}</td>
      <td className="px-4 py-3 text-right font-mono text-gray-300">
        {formatQuantity(ins.quantity, ins.unit)}
      </td>
      <td className="px-4 py-3">
        <StockBadge quantity={ins.quantity} minQuantity={ins.min_quantity} unit={ins.unit} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {userRole === 'admin' && (
            <>
              <button
                onClick={onAddStock}
                className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 hover:border-green-500/50 hover:bg-green-500/20 transition-colors whitespace-nowrap"
              >
                + Estoque
              </button>
              <button
                onClick={onEditQty}
                title="Ajustar quantidade"
                className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2 py-1 text-xs text-gray-400 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-200 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                Ajustar
              </button>
            </>
          )}
          <Link
            href={`/farms/${farmId}/insumos/${ins.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            Detalhe
          </Link>
          {userRole === 'admin' && (
            <ConfirmDeleteButton
              onConfirm={async () => {
                const res = await fetch(`/api/farms/${farmId}/insumos/${ins.id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error('Falha ao apagar insumo')
                onDeleted()
              }}
            />
          )}
        </div>
      </td>
    </tr>
  )
})

// ─── InsumoCard (mobile) ─────────────────────────────────────────────────────

const InsumoCard = memo(function InsumoCard({
  ins,
  farmId,
  userRole,
  onAddStock,
  onEditQty,
  onDeleted,
}: {
  ins: any
  farmId: string
  userRole: 'admin' | 'operario'
  onAddStock: () => void
  onEditQty: () => void
  onDeleted: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/farms/${farmId}/insumos/${ins.id}`} className="text-base font-semibold text-gray-100 hover:text-green-400 transition-colors">
            {ins.title}
          </Link>
          {ins.description && (
            <p className="mt-0.5 text-xs text-gray-500 truncate">{ins.description}</p>
          )}
        </div>
        <StockBadge quantity={ins.quantity} minQuantity={ins.min_quantity} unit={ins.unit} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-gray-400 font-mono font-semibold">{formatQuantity(ins.quantity, ins.unit)}</span>
        <span className="text-gray-700 text-xs uppercase">{ins.unit}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {userRole === 'admin' && (
          <>
            <button
              onClick={onAddStock}
              className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20 transition-colors"
            >
              + Estoque
            </button>
            <button
              onClick={onEditQty}
              className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              Ajustar
            </button>
          </>
        )}
        <Link
          href={`/farms/${farmId}/insumos/${ins.id}`}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800/60 py-2 text-center text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors"
        >
          Detalhe
        </Link>
        {userRole === 'admin' && (
          <ConfirmDeleteButton
            onConfirm={async () => {
              const res = await fetch(`/api/farms/${farmId}/insumos/${ins.id}`, { method: 'DELETE' })
              if (!res.ok) throw new Error('Falha ao apagar insumo')
              onDeleted()
            }}
            className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-2 text-sm font-medium text-red-400/80 hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          />
        )}
      </div>
    </div>
  )
})

// ─── AdjustQuantityModal ─────────────────────────────────────────────────────

function AdjustQuantityModal({
  farmId,
  insumoId,
  insumoTitle,
  unit,
  currentQty,
  onClose,
  onSuccess,
}: {
  farmId: string
  insumoId: string
  insumoTitle: string
  unit: string
  currentQty: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [newQty,  setNewQty]  = useState(String(currentQty))
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const unitLabel = 'kg'
  const delta = Number(newQty) - currentQty

  async function handleSave() {
    const qty = Number(newQty)
    if (isNaN(qty) || qty < 0) { setError('Quantidade inválida.'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/farms/${farmId}/insumos/${insumoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty, adjustment_notes: notes || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Falha ao salvar.'); return }
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <h3 className="mb-1 text-base font-semibold text-gray-100">Ajustar Estoque</h3>
        <p className="mb-5 text-xs text-gray-500 truncate">{insumoTitle}</p>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-400">
            Nova quantidade ({unitLabel})
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.001"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2.5 text-sm text-gray-100 focus:border-green-500/60 focus:outline-none"
              autoFocus
            />
            <span className="shrink-0 text-sm text-gray-500">{unitLabel}</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Atual: <span className="text-gray-400">{formatQuantity(currentQty, unit)}</span>
            {!isNaN(delta) && Math.abs(delta) > 0.0001 && (
              <span className={delta > 0 ? 'text-green-400 ml-2' : 'text-red-400 ml-2'}>
                {delta > 0 ? `+${formatQuantity(delta, unit)}` : `−${formatQuantity(Math.abs(delta), unit)}`}
              </span>
            )}
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-400">
            Motivo do ajuste <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: correção de inventário, perda, devolução..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-green-500/60 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-600">Registrado no histórico de movimentações.</p>
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-2.5 text-sm text-gray-300 hover:text-gray-100 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  message,
  action,
}: {
  icon: 'box' | 'map'
  message: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800">
        {icon === 'box' ? (
          <svg className="h-6 w-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        ) : (
          <svg className="h-6 w-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-500">{message}</p>
      {action && (
        <Link href={action.href} className="mt-3">
          <Button size="sm" variant="secondary">{action.label}</Button>
        </Link>
      )}
    </div>
  )
}
