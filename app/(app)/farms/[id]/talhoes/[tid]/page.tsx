import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { TalhaoTabs } from '@/components/TalhaoTabs'

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

  const [
    { data: farm },
    { data: talhao },
    { data: transactions },
    { data: adjustments },
  ] = await Promise.all([
    supabase.from('farms').select('id, name').eq('id', farmId).single(),
    supabase.from('talhoes').select('*').eq('id', tid).eq('farm_id', farmId).single(),
    supabase
      .from('transactions')
      .select('id, type, quantity, date, created_at, notes, area_ha, insumos(title, unit), users(name)')
      .eq('farm_id', farmId)
      .eq('talhao_id', tid)
      .eq('type', 'saida')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('implement_adjustments')
      .select('*, users(name)')
      .eq('farm_id', farmId)
      .eq('talhao_id', tid)
      .order('created_at', { ascending: false }),
  ])

  if (!farm || !talhao) notFound()

  const rawList = transactions ?? []

  // ── Acumulado de área por insumo (ordem cronológica) ──────────────────────
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
      _area: area,
      _prevAccum: prevAccum,
      _accumArea: newAccum,
      _kgHa: area != null && area > 0 ? qty / area : null,
    }
  })

  // Mais recente no topo
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
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{talhao.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {Number(talhao.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha cadastrados
            {' · '}
            {rawList.length} retirada{rawList.length !== 1 ? 's' : ''} registrada{rawList.length !== 1 ? 's' : ''}
            {adjustments && adjustments.length > 0 && (
              <>
                {' · '}
                {adjustments.length} regulagem{adjustments.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Link
            href={`/farms/${farmId}/retirada?talhao=${tid}`}
            className="flex items-center gap-2 rounded-lg border border-green-600/40 bg-green-600/10 px-3 py-2.5 sm:py-2 text-sm font-medium text-green-400 hover:bg-green-600/20 hover:border-green-500/60 transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" />
            </svg>
            Registrar Aplicação
          </Link>
          <Link
            href={`/farms/${farmId}`}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 sm:py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Voltar à fazenda
          </Link>
        </div>
      </div>

      <TalhaoTabs
        farmId={farmId}
        talhaoId={tid}
        talhaoAreaHa={Number(talhao.area_ha)}
        txDisplay={txDisplay as any}
        summary={summary}
        adjustments={(adjustments ?? []) as any}
      />
    </div>
  )
}
