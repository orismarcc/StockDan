import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { formatDate, formatTime, formatQuantity } from '@/lib/utils'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; tid: string }>
}) {
  const { tid } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('talhoes').select('name').eq('id', tid).single()
  return { title: data?.name ?? 'Talhão' }
}

export default async function TalhaoDetailPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id: farmId, tid } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farmId))) redirect('/dashboard')

  const [{ data: farm }, { data: talhao }, { data: transactions }] = await Promise.all([
    supabase.from('farms').select('id, name').eq('id', farmId).single(),
    supabase.from('talhoes').select('*').eq('id', tid).eq('farm_id', farmId).single(),
    supabase
      .from('transactions')
      .select('id, type, quantity, date, created_at, notes, insumos(title, unit), users(name)')
      .eq('farm_id', farmId)
      .eq('talhao_id', tid)
      .eq('type', 'saida')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (!farm || !talhao) notFound()

  const txList = transactions ?? []

  // Totais por insumo
  const summaryMap: Record<string, { title: string; unit: 'kg' | 'bag'; total: number; count: number }> = {}
  for (const tx of txList) {
    const title = (tx.insumos as any)?.title ?? 'Desconhecido'
    const unit  = (tx.insumos as any)?.unit  ?? 'kg'
    if (!summaryMap[title]) summaryMap[title] = { title, unit, total: 0, count: 0 }
    summaryMap[title].total += Number(tx.quantity)
    summaryMap[title].count += 1
  }
  const summary = Object.values(summaryMap).sort((a, b) => b.total - a.total)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/farms/${farmId}`} className="hover:text-gray-300 transition-colors">
          {farm.name}
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-400">{talhao.name}</span>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{talhao.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {Number(talhao.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
            {' · '}
            {txList.length} retirada{txList.length !== 1 ? 's' : ''} registrada{txList.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href={`/farms/${farmId}`}
          className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Voltar à fazenda
        </Link>
      </div>

      {txList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
            <svg className="h-7 w-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-gray-400">Nenhuma retirada registrada para este talhão ainda.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Resumo por insumo */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Resumo de Insumos Utilizados
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summary.map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-gray-800 bg-gray-900/40 p-4"
                >
                  <p className="text-xs text-gray-500 truncate">{s.title}</p>
                  <p className="mt-1 text-xl font-bold text-gray-100">
                    {formatQuantity(s.total, s.unit)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    em {s.count} retirada{s.count !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico completo */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Histórico de Retiradas
            </h2>
            <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/40">
              <table className="w-full text-sm" style={{ minWidth: '560px' }}>
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Insumo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Quantidade</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Responsável</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {txList.map((tx: any) => (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-gray-400">{formatDate(tx.date)}</span>
                        {tx.created_at && (
                          <span className="block text-[11px] text-gray-600">
                            reg. {formatTime(tx.created_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-200">
                        {tx.insumos?.title ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300 whitespace-nowrap">
                        {tx.insumos
                          ? formatQuantity(Number(tx.quantity), tx.insumos.unit)
                          : tx.quantity}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {tx.users?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                        {tx.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
