import { formatDate, formatQuantity } from '@/lib/utils'

export interface Transaction {
  id: string
  type: 'entrada' | 'saida'
  quantity: number
  date: string
  notes: string | null
  insumos: { title: string; unit: 'kg' | 'bag' } | null
  talhoes: { name: string } | null
  users: { name: string } | null
}

interface TransactionTableProps {
  transactions: Transaction[]
  showInsumo?: boolean
}

export function TransactionTable({ transactions, showInsumo = true }: TransactionTableProps) {
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Data</th>
            <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tipo</th>
            {showInsumo && (
              <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Insumo</th>
            )}
            <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Quantidade</th>
            <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Talhão</th>
            <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Usuário</th>
            <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Observação</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
              <td className="py-3 text-gray-400">{formatDate(tx.date)}</td>
              <td className="py-3">
                {tx.type === 'entrada' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M6 2.5v7m0 0l-2.5-2.5M6 9.5l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </svg>
                    Entrada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M6 9.5v-7m0 0l-2.5 2.5M6 2.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </svg>
                    Retirada
                  </span>
                )}
              </td>
              {showInsumo && (
                <td className="py-3 text-gray-300">{tx.insumos?.title ?? '—'}</td>
              )}
              <td className="py-3 text-right font-mono text-gray-300">
                {tx.insumos
                  ? formatQuantity(tx.quantity, tx.insumos.unit)
                  : tx.quantity}
              </td>
              <td className="py-3 text-gray-400">{tx.talhoes?.name ?? '—'}</td>
              <td className="py-3 text-gray-400">{tx.users?.name ?? '—'}</td>
              <td className="py-3 text-gray-500 max-w-xs truncate">{tx.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
