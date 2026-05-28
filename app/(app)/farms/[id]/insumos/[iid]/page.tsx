import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { formatQuantity } from '@/lib/utils'
import { StockBadge } from '@/components/StockBadge'
import { TransactionTable } from '@/components/TransactionTable'
import { InsumoActions } from '@/components/InsumoActions'
import { can } from '@/lib/permissions'

export async function generateMetadata({ params }: { params: Promise<{ id: string; iid: string }> }) {
  const session = await getSession()
  if (!session) return { title: 'Insumo' }
  const { id: farm_id, iid } = await params
  const supabase = createServerClient()
  if (!(await checkFarmAccess(supabase, session, farm_id))) return { title: 'Insumo' }
  const { data } = await supabase.from('insumos').select('title').eq('id', iid).eq('farm_id', farm_id).single()
  return { title: data?.title ?? 'Insumo' }
}

export default async function InsumoDetailPage({
  params,
}: {
  params: Promise<{ id: string; iid: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id: farmId, iid } = await params
  const supabase = createServerClient()

  const [{ data: farm }, { data: insumo }, { data: transactions }] = await Promise.all([
    supabase.from('farms').select('id, name').eq('id', farmId).single(),
    supabase.from('insumos').select('*').eq('id', iid).single(),
    supabase
      .from('transactions')
      .select('*, insumos(title, unit), talhoes(name), users(name)')
      .eq('insumo_id', iid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (!farm || !insumo) notFound()

  const totalEntradas = (transactions ?? [])
    .filter((t: any) => t.type === 'entrada')
    .reduce((sum: number, t: any) => sum + Number(t.quantity), 0)

  const totalSaidas = (transactions ?? [])
    .filter((t: any) => t.type === 'saida')
    .reduce((sum: number, t: any) => sum + Number(t.quantity), 0)

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/farms/${farmId}`}
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          {farm.name}
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-100 truncate">{insumo.title}</h1>
            {insumo.description && (
              <p className="mt-1 text-sm text-gray-500">{insumo.description}</p>
            )}
          </div>
          {can(session.role, 'transaction.entrada') && (
            <div className="shrink-0">
              <InsumoActions farmId={farmId} insumo={insumo} />
            </div>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Estoque Atual" value={formatQuantity(insumo.quantity, insumo.unit)} highlight>
          <StockBadge quantity={insumo.quantity} minQuantity={insumo.min_quantity} unit={insumo.unit} className="mt-1" />
        </MetricCard>
        <MetricCard label="Total de Entradas" value={formatQuantity(totalEntradas, insumo.unit)} />
        <MetricCard label="Total de Saídas" value={formatQuantity(totalSaidas, insumo.unit)} />
        <MetricCard
          label="Estoque Mínimo"
          value={insumo.min_quantity != null ? formatQuantity(insumo.min_quantity, insumo.unit) : '—'}
        />
      </div>

      {/* Histórico */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Histórico de Movimentações
        </h2>
        <TransactionTable transactions={transactions ?? []} showInsumo={false} />
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
  children,
}: {
  label: string
  value: string
  highlight?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-green-500/20 bg-green-500/5' : 'border-gray-800 bg-gray-900/40'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? 'text-green-400' : 'text-gray-100'}`}>{value}</p>
      {children}
    </div>
  )
}
