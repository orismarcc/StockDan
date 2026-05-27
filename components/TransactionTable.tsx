'use client'

import { useState } from 'react'
import { formatDate, formatTime, formatQuantity } from '@/lib/utils'

export interface Transaction {
  id: string
  type: 'entrada' | 'saida'
  quantity: number
  date: string
  created_at: string
  notes: string | null
  insumos: { title: string; unit: string } | null
  talhoes: { id: string; name: string } | null
  users: { name: string } | null
}

interface TransactionTableProps {
  transactions: Transaction[]
  showInsumo?: boolean
  farmId?: string
  userRole?: 'admin' | 'operario'
  talhoes?: { id: string; name: string; area_ha: number }[]
  onEdit?: (tx: Transaction) => void
  onDelete?: (txId: string) => void
  pageSize?: number
}

export function TransactionTable({
  transactions,
  showInsumo = true,
  farmId,
  userRole,
  onEdit,
  onDelete,
  pageSize = 50,
}: TransactionTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [page, setPage] = useState(0)

  const canEdit = userRole === 'admin' && farmId && (onEdit || onDelete)
  const totalPages = Math.ceil(transactions.length / pageSize)
  const paginated = transactions.slice(page * pageSize, (page + 1) * pageSize)

  async function handleDelete(txId: string) {
    if (!farmId) return
    setDeletingId(txId)
    setDeleteError('')
    const res = await fetch(`/api/farms/${farmId}/transactions/${txId}`, { method: 'DELETE' })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) {
      setDeleteError(data.error)
      setConfirmDeleteId(null)
      return
    }
    setConfirmDeleteId(null)
    onDelete?.(txId)
  }

  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center">
        <svg className="mx-auto h-10 w-10 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
        <p className="mt-3 text-sm text-gray-600">Nenhuma movimentação registrada</p>
      </div>
    )
  }

  const TypeBadge = ({ type }: { type: 'entrada' | 'saida' }) =>
    type === 'entrada' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400 whitespace-nowrap">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 2.5v7m0 0l-2.5-2.5M6 9.5l2.5-2.5" />
        </svg>
        Entrada
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 whitespace-nowrap">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 9.5v-7m0 0l-2.5 2.5M6 2.5l2.5 2.5" />
        </svg>
        Retirada
      </span>
    )

  const Pagination = () =>
    totalPages > 1 ? (
      <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-600">
          {page * pageSize + 1}–{Math.min((page + 1) * pageSize, transactions.length)} de {transactions.length}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(0)} disabled={page === 0} className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors" aria-label="Primeira página">«</button>
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors" aria-label="Anterior">‹</button>
          <span className="px-2 text-xs text-gray-500">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors" aria-label="Próxima">›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors" aria-label="Última">»</button>
        </div>
      </div>
    ) : null

  return (
    <div>
      {deleteError && (
        <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {deleteError}
        </p>
      )}

      {/* ── Mobile: cards (< sm) ───────────────────────────────────────────── */}
      <div className="sm:hidden space-y-2">
        {paginated.map((tx) => (
          <div key={tx.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            {/* Linha 1: insumo + tipo */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                {showInsumo && (
                  <p className="text-sm font-medium text-gray-200 truncate">{tx.insumos?.title ?? '—'}</p>
                )}
                {tx.talhoes?.name && (
                  <p className="text-xs text-gray-500 mt-0.5">{tx.talhoes.name}</p>
                )}
              </div>
              <TypeBadge type={tx.type} />
            </div>

            {/* Linha 2: quantidade + data */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-base font-semibold text-gray-100">
                {tx.insumos ? formatQuantity(tx.quantity, tx.insumos.unit) : tx.quantity}
              </span>
              <div className="text-right">
                <span className="text-xs text-gray-400">{formatDate(tx.date)}</span>
                {tx.created_at && (
                  <span className="block text-[11px] text-gray-600">reg. {formatTime(tx.created_at)}</span>
                )}
              </div>
            </div>

            {/* Linha 3: observação + usuário */}
            {(tx.notes || tx.users?.name) && (
              <div className="mt-2 pt-2 border-t border-gray-800/60 flex items-center justify-between gap-2">
                {tx.notes
                  ? <p className="text-xs text-gray-500 truncate flex-1">{tx.notes}</p>
                  : <span />
                }
                {tx.users?.name && (
                  <p className="text-xs text-gray-600 shrink-0">{tx.users.name}</p>
                )}
              </div>
            )}

            {/* Linha 4: ações */}
            {canEdit && (
              <div className="mt-3 flex gap-2">
                {confirmDeleteId === tx.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      disabled={deletingId === tx.id}
                      className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {deletingId === tx.id ? 'Excluindo...' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 rounded-lg border border-gray-700 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onEdit?.(tx)}
                      className="flex-1 rounded-lg border border-gray-700 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(tx.id)}
                      className="flex-1 rounded-lg border border-red-500/20 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      Excluir
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Desktop: tabela (≥ sm) ─────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '640px' }}>
          <thead>
            <tr className="border-b border-gray-800">
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Data</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tipo</th>
              {showInsumo && (
                <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Insumo</th>
              )}
              <th className="pb-3 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Quantidade</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Talhão</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Usuário</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Observação</th>
              {canEdit && <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.map((tx) => (
              <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="text-gray-400">{formatDate(tx.date)}</span>
                  {tx.created_at && (
                    <span className="block text-[11px] text-gray-600">
                      reg. {formatTime(tx.created_at)}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <TypeBadge type={tx.type} />
                </td>
                {showInsumo && (
                  <td className="py-3 pr-4 text-gray-300">{tx.insumos?.title ?? '—'}</td>
                )}
                <td className="py-3 pr-6 text-right font-mono text-gray-300 whitespace-nowrap">
                  {tx.insumos
                    ? formatQuantity(tx.quantity, tx.insumos.unit)
                    : tx.quantity}
                </td>
                <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{tx.talhoes?.name ?? '—'}</td>
                <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{tx.users?.name ?? '—'}</td>
                <td className="py-3 pr-4 text-gray-500 max-w-[180px] truncate">{tx.notes ?? '—'}</td>
                {canEdit && (
                  <td className="py-3 text-right whitespace-nowrap">
                    {confirmDeleteId === tx.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={deletingId === tx.id}
                          className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:border-red-500/50 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {deletingId === tx.id ? 'Excluindo...' : 'Confirmar exclusão'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="inline-flex items-center rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => onEdit?.(tx)}
                          className="inline-flex items-center rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(tx.id)}
                          className="inline-flex items-center rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-500 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          Excluir
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination />
    </div>
  )
}
