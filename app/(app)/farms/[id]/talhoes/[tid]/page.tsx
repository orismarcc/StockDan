import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { formatDate, formatTime, formatQuantity } from '@/lib/utils'
import { AreaCell } from '@/components/AreaCell'

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

// ─── helpers ───────────────────────────────────────────────────────────────

function fmtHa(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha'
}

function fmtKgHa(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg/ha'
}

// ─── page ──────────────────────────────────────────────────────────────────

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
      // area_ha incluído
      .select('id, type, quantity, date, created_at, notes, area_ha, insumos(title, unit), users(name)')
      .eq('farm_id', farmId)
      .eq('talhao_id', tid)
      .eq('type', 'saida')
      // ascending para calcular os acumulados corretamente
      .order('date', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (!farm || !talhao) notFound()

  const rawList = transactions ?? []

  // ── Calcula acumulado de área por insumo (ordem cronológica) ──────────────
  const accumByInsumo: Record<string, number> = {}

  const txEnriched = rawList.map((tx) => {
    const insumoTitle: string = (tx.insumos as any)?.title ?? 'Desconhecido'
    const qty = Number(tx.quantity)
    const area = tx.area_ha != null ? Number(tx.area_ha) : null

    const prevAccum = accumByInsumo[insumoTitle] ?? 0
    const newAccum = prevAccum + (area ?? 0)
    accumByInsumo[insumoTitle] = newAccum

    return {
      ...tx,
      _insumoTitle: insumoTitle,
      _insumoUnit: ((tx.insumos as any)?.unit ?? 'kg') as 'kg' | 'bag',
      _qty: qty,
      _area: area,           // ha aplicados nesta retirada (null = não registrado)
      _prevAccum: prevAccum, // área acumulada ANTES desta linha
      _accumArea: newAccum,  // área acumulada ATÉ esta linha (inclusive)
      _kgHa: area != null && area > 0 ? qty / area : null,
    }
  })

  // Exibe mais recente no topo
  const txDisplay = [...txEnriched].reverse()

  // ── Resumo por insumo ─────────────────────────────────────────────────────
  const summaryMap: Record<string, {
    title: string
    unit: 'kg' | 'bag'
    totalQty: number
    count: number
    totalArea: number
    hasArea: boolean
  }> = {}

  for (const tx of txEnriched) {
    const key = tx._insumoTitle
    if (!summaryMap[key]) {
      summaryMap[key] = { title: key, unit: tx._insumoUnit, totalQty: 0, count: 0, totalArea: 0, hasArea: false }
    }
    summaryMap[key].totalQty += tx._qty
    summaryMap[key].count += 1
    if (tx._area != null) {
      summaryMap[key].totalArea += tx._area
      summaryMap[key].hasArea = true
    }
  }

  const summary = Object.values(summaryMap).sort((a, b) => b.totalQty - a.totalQty)

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
            {Number(talhao.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha cadastrados
            {' · '}
            {rawList.length} retirada{rawList.length !== 1 ? 's' : ''} registrada{rawList.length !== 1 ? 's' : ''}
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

      {rawList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
            <svg className="h-7 w-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-gray-400">Nenhuma retirada registrada para este talhão ainda.</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Resumo por insumo ─────────────────────────────────────────── */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Resumo de Insumos Utilizados
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summary.map((s) => {
                const avgKgHa = s.hasArea && s.totalArea > 0 ? s.totalQty / s.totalArea : null
                return (
                  <div key={s.title} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
                    <p className="text-xs text-gray-500 truncate">{s.title}</p>
                    <p className="text-xl font-bold text-gray-100">
                      {formatQuantity(s.totalQty, s.unit)}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{s.count} retirada{s.count !== 1 ? 's' : ''}</span>
                      {s.hasArea && (
                        <>
                          <span className="text-green-400/80">{fmtHa(s.totalArea)} aplicados</span>
                          {avgKgHa != null && (
                            <span className="text-gray-400">{fmtKgHa(avgKgHa)} médio</span>
                          )}
                        </>
                      )}
                      {!s.hasArea && (
                        <span className="text-amber-500/60 italic">área não registrada</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Histórico de retiradas ────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Histórico de Retiradas
              </h2>
              <p className="text-[11px] text-gray-600">
                Clique em <span className="text-green-500/60">+ Registrar</span> para adicionar a área aplicada após a operação
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/40">
              <table className="w-full text-sm" style={{ minWidth: '820px' }}>
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Insumo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Quantidade</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-900/40">
                      <span className="text-green-500/70">Área Aplic.</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-900/40">
                      <span className="text-green-500/70">Acum. (ha)</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-900/40">
                      <span className="text-green-500/70">kg/ha</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Responsável</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {txDisplay.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">

                      {/* Data + horário */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-gray-400">{formatDate(tx.date)}</span>
                        {tx.created_at && (
                          <span className="block text-[11px] text-gray-600">
                            reg. {formatTime(tx.created_at)}
                          </span>
                        )}
                      </td>

                      {/* Insumo */}
                      <td className="px-4 py-3 font-medium text-gray-200 whitespace-nowrap">
                        {tx._insumoTitle}
                      </td>

                      {/* Quantidade */}
                      <td className="px-4 py-3 text-right font-mono text-gray-300 whitespace-nowrap">
                        {formatQuantity(tx._qty, tx._insumoUnit)}
                      </td>

                      {/* Área aplicada — editável */}
                      <td className="px-4 py-3 text-center bg-gray-900/20">
                        <AreaCell farmId={farmId} txId={tx.id} area={tx._area} />
                      </td>

                      {/* Área acumulada deste insumo */}
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap bg-gray-900/20">
                        {tx._accumArea > 0 ? (
                          <span className="text-green-400/80">
                            {tx._accumArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>

                      {/* kg/ha desta retirada */}
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap bg-gray-900/20">
                        {tx._kgHa != null ? (
                          <span className="text-gray-300">
                            {tx._kgHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </span>
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>

                      {/* Responsável */}
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {(tx.users as any)?.name ?? '—'}
                      </td>

                      {/* Observação */}
                      <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">
                        {tx.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Totais rodapé */}
                {txDisplay.some((tx) => tx._area != null) && (
                  <tfoot>
                    <tr className="border-t border-gray-700 bg-gray-900/60">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Totais por insumo
                      </td>
                      <td colSpan={5} className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 justify-end">
                          {summary.filter((s) => s.hasArea).map((s) => {
                            const kgHa = s.totalArea > 0 ? s.totalQty / s.totalArea : null
                            return (
                              <span key={s.title} className="text-xs text-gray-400">
                                <span className="text-gray-300 font-medium">{s.title}:</span>{' '}
                                {fmtHa(s.totalArea)}
                                {kgHa != null && <span className="text-gray-500"> · {fmtKgHa(kgHa)}</span>}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
