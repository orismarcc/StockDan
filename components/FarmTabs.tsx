'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn, formatQuantity } from '@/lib/utils'
import { StockBadge } from './StockBadge'
import { TransactionTable, Transaction } from './TransactionTable'
import { AddStockModal } from './AddStockModal'
import { EditTransactionModal } from './EditTransactionModal'
import { Button } from './ui/Button'

type TabId = 'insumos' | 'talhoes' | 'historico'

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
  const [tab, setTab] = useState<TabId>('insumos')
  const [addStockFor, setAddStockFor] = useState<{ id: string; title: string; unit: 'kg' | 'bag' } | null>(null)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const router = useRouter()

  // Compute per-talhão insumo usage totals from the transactions already loaded
  const talhaoUsage = useMemo(() => {
    const result: Record<string, { title: string; unit: 'kg' | 'bag'; total: number }[]> = {}
    for (const tx of transactions) {
      if (tx.type !== 'saida' || !tx.talhoes?.id || !tx.insumos) continue
      const tid = tx.talhoes.id
      if (!result[tid]) result[tid] = []
      const existing = result[tid].find((s) => s.title === tx.insumos!.title)
      if (existing) {
        existing.total += Number(tx.quantity)
      } else {
        result[tid].push({ title: tx.insumos.title, unit: tx.insumos.unit, total: Number(tx.quantity) })
      }
    }
    return result
  }, [transactions])

  // Área acumulada e média kg/ha por talhão
  const talhaoAreaStats = useMemo(() => {
    const result: Record<string, { accumArea: number; totalQty: number }> = {}
    for (const tx of transactions) {
      if (tx.type !== 'saida' || !tx.talhoes?.id) continue
      const tid = tx.talhoes.id
      if (!result[tid]) result[tid] = { accumArea: 0, totalQty: 0 }
      result[tid].totalQty += Number(tx.quantity)
      if ((tx as any).area_ha != null && Number((tx as any).area_ha) > 0) {
        result[tid].accumArea += Number((tx as any).area_ha)
      }
    }
    return result
  }, [transactions])

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'insumos',   label: 'Insumos',   count: insumos.length },
    { id: 'talhoes',   label: 'Talhões',   count: talhoes.length },
    { id: 'historico', label: 'Histórico', count: transactions.length },
  ]

  return (
    <>
      {/* Tab nav */}
      <div className="mb-6 flex gap-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
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

      {/* Insumos */}
      {tab === 'insumos' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">
              {insumos.length} insumo{insumos.length !== 1 ? 's' : ''} cadastrado{insumos.length !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Link href={`/farms/${farm.id}/retirada`}>
                <Button variant="secondary" size="sm">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" />
                  </svg>
                  Registrar Retirada
                </Button>
              </Link>
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
          </div>

          {insumos.length === 0 ? (
            <EmptyState
              icon="box"
              message="Nenhum insumo cadastrado"
              action={userRole === 'admin' ? { label: 'Cadastrar insumo', href: `/farms/${farm.id}/insumos/new` } : undefined}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm" style={{ minWidth: '540px' }}>
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
                    <tr key={ins.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/farms/${farm.id}/insumos/${ins.id}`} className="font-medium text-gray-200 hover:text-green-400 transition-colors">
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
                        <div className="flex items-center justify-end gap-2">
                          {userRole === 'admin' && (
                            <button
                              onClick={() => setAddStockFor({ id: ins.id, title: ins.title, unit: ins.unit })}
                              className="inline-flex items-center gap-1 rounded-md border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 hover:border-green-500/50 hover:bg-green-500/20 transition-colors whitespace-nowrap"
                            >
                              + Estoque
                            </button>
                          )}
                          <Link
                            href={`/farms/${farm.id}/insumos/${ins.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
                          >
                            Detalhe
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Talhões */}
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
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm" style={{ minWidth: '680px' }}>
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Talhão</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Área (ha)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <span className="text-green-500/70">Aplic. acum.</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <span className="text-green-500/70">Média kg/ha</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Insumos</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {talhoes.map((t) => {
                    const usage    = talhaoUsage[t.id] ?? []
                    const areaStat = talhaoAreaStats[t.id]
                    const avgKgHa  = areaStat && areaStat.accumArea > 0
                      ? areaStat.totalQty / areaStat.accumArea
                      : null
                    return (
                      <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/farms/${farm.id}/talhoes/${t.id}`}
                            className="font-medium text-gray-200 hover:text-green-400 transition-colors"
                          >
                            {t.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-400 whitespace-nowrap">
                          {Number(t.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {areaStat && areaStat.accumArea > 0 ? (
                            <span className="text-green-400/80">
                              {areaStat.accumArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
                            </span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {avgKgHa != null ? (
                            <span className="text-gray-300">
                              {avgKgHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {usage.length === 0 ? (
                            <span className="text-xs text-gray-700">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                              {usage.map((s) => (
                                <span key={s.title} className="text-xs text-gray-400">
                                  {s.title}:{' '}
                                  <span className="font-medium text-gray-300">
                                    {formatQuantity(s.total, s.unit)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Link
                            href={`/farms/${farm.id}/talhoes/${t.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
                          >
                            Ver histórico
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Histórico */}
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

      {/* Modal adicionar estoque */}
      {addStockFor && (
        <AddStockModal
          farmId={farm.id}
          insumoId={addStockFor.id}
          insumoTitle={addStockFor.title}
          unit={addStockFor.unit}
          onClose={() => setAddStockFor(null)}
          onSuccess={() => {
            setAddStockFor(null)
            router.refresh()
          }}
        />
      )}

      {/* Modal editar transação */}
      {editTx && (
        <EditTransactionModal
          farmId={farm.id}
          transaction={editTx}
          talhoes={talhoes}
          onClose={() => setEditTx(null)}
          onSuccess={() => {
            setEditTx(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

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
