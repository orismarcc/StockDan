'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatDate, formatTime, formatQuantity } from '@/lib/utils'
import { AreaCell } from './AreaCell'
import { ImplementAdjustmentForm } from './ImplementAdjustmentForm'

// ─── types ──────────────────────────────────────────────────────────────────

interface EnrichedTx {
  id: string
  date: string
  created_at: string | null
  notes: string | null
  _insumoTitle: string
  _insumoUnit: string
  _qty: number
  _area: number | null
  _accumArea: number
  _kgHa: number | null
}

interface InsumoSummary {
  title: string
  unit: string
  totalQty: number
  count: number
  totalArea: number
  hasArea: boolean
}

interface ImplementAdjustment {
  id: string
  created_at: string
  implemento: string | null
  taxa_kgha: number | null
  palhetas: string | null
  rpm_maquina: number | null
  rpm_pratos_eixo: number | null
  num_bandejas: number | null
  espacamento_bandejas: string | null
  cv_percent: number | null
  faixa_aplicacao: string | null
  comporta: string | null
  users: { name: string } | null
}

interface TalhaoTabsProps {
  farmId: string
  talhaoId: string
  talhaoAreaHa: number
  txDisplay: EnrichedTx[]
  summary: InsumoSummary[]
  adjustments: ImplementAdjustment[]
}

type TabId = 'retiradas' | 'regulagem'

// ─── formatters ─────────────────────────────────────────────────────────────

function fmtHa(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ha'
}

function fmtKgHa(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg/ha'
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR')
}

// ─── component ──────────────────────────────────────────────────────────────

export function TalhaoTabs({
  farmId,
  talhaoId,
  talhaoAreaHa,
  txDisplay,
  summary,
  adjustments,
}: TalhaoTabsProps) {
  const [tab, setTab] = useState<TabId>('retiradas')
  const [showNewForm, setShowNewForm] = useState(false)

  // Agrupar retiradas por insumo (mantendo ordem mais recente primeiro)
  const txByInsumo = useMemo(() => {
    const groups: { title: string; unit: string; txs: EnrichedTx[] }[] = []
    const seen = new Map<string, number>()
    for (const tx of txDisplay) {
      if (!seen.has(tx._insumoTitle)) {
        seen.set(tx._insumoTitle, groups.length)
        groups.push({ title: tx._insumoTitle, unit: tx._insumoUnit, txs: [] })
      }
      groups[seen.get(tx._insumoTitle)!].txs.push(tx)
    }
    return groups
  }, [txDisplay])

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'retiradas', label: 'Retiradas', count: txDisplay.length },
    { id: 'regulagem', label: 'Regulagem de Implementos', count: adjustments.length },
  ]

  return (
    <>
      {/* Resumo por insumo */}
      {summary.length > 0 && (
        <div className="mb-8">
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
      )}

      {/* Tab nav */}
      <div className="mb-5 flex gap-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1">
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

      {/* ── Tab: Retiradas ────────────────────────────────────────────────── */}
      {tab === 'retiradas' && (
        <div>
          {txDisplay.length === 0 ? (
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
              {/* Tabela separada por insumo */}
              {txByInsumo.map((group) => {
                const groupSummary = summary.find((s) => s.title === group.title)
                return (
                  <div key={group.title}>
                    {/* Cabeçalho do grupo */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-gray-800" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                          {group.title}
                        </span>
                        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-600">
                          {group.txs.length} retirada{group.txs.length !== 1 ? 's' : ''}
                        </span>
                        {groupSummary?.hasArea && groupSummary.totalArea > 0 && (
                          <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs text-green-400/80">
                            {fmtHa(groupSummary.totalArea)} aplicados
                            {groupSummary.totalQty > 0 && groupSummary.totalArea > 0 && (
                              <span className="text-gray-500 ml-1">
                                · {fmtKgHa(groupSummary.totalQty / groupSummary.totalArea)}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="h-px flex-1 bg-gray-800" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/40">
                      <table className="w-full text-sm" style={{ minWidth: '760px' }}>
                        <thead>
                          <tr className="border-b border-gray-800 bg-gray-900/60">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Data</th>
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
                          {group.txs.map((tx) => {
                            return (
                              <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-gray-400">{formatDate(tx.date)}</span>
                                  {tx.created_at && (
                                    <span className="block text-[11px] text-gray-600">reg. {formatTime(tx.created_at)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-gray-300 whitespace-nowrap">
                                  {formatQuantity(tx._qty, tx._insumoUnit)}
                                </td>
                                <td className="px-4 py-3 text-center bg-gray-900/20">
                                  <div className="flex items-center justify-center gap-1">
                                    <AreaCell farmId={farmId} txId={tx.id} area={tx._area} />
                                    {tx._area == null && (
                                      <svg
                                        className="h-3.5 w-3.5 shrink-0 text-amber-500/80"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        aria-label="Área não informada"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono whitespace-nowrap bg-gray-900/20">
                                  {tx._accumArea > 0 ? (
                                    <span className="text-green-400/80">
                                      {tx._accumArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                  ) : (
                                    <span className="text-gray-700">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-mono whitespace-nowrap bg-gray-900/20">
                                  {tx._kgHa != null ? (
                                    <span className="text-gray-300">
                                      {tx._kgHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </span>
                                  ) : (
                                    <span className="text-gray-700">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{(tx as any).users?.name ?? '—'}</td>
                                <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{tx.notes ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Regulagem de Implementos ─────────────────────────────────── */}
      {tab === 'regulagem' && (
        <div className="space-y-6">

          {/* Botão novo */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {adjustments.length === 0
                ? 'Nenhuma regulagem registrada ainda'
                : `${adjustments.length} regulagem${adjustments.length !== 1 ? 's' : ''} registrada${adjustments.length !== 1 ? 's' : ''}`}
            </p>
            <button
              onClick={() => setShowNewForm((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400 hover:border-green-500/50 hover:bg-green-500/15 transition-colors"
            >
              {showNewForm ? (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Cancelar
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Nova Regulagem
                </>
              )}
            </button>
          </div>

          {/* Formulário */}
          {showNewForm && (
            <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">Nova Regulagem de Implemento</h3>
              <ImplementAdjustmentForm
                farmId={farmId}
                talhaoId={talhaoId}
                onSuccess={() => setShowNewForm(false)}
                onCancel={() => setShowNewForm(false)}
              />
            </div>
          )}

          {/* Lista de regulagens */}
          {adjustments.length === 0 && !showNewForm ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800">
                <svg className="h-6 w-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-gray-500">Registre a regulagem do implemento antes de iniciar a aplicação</p>
              <button
                onClick={() => setShowNewForm(true)}
                className="mt-3 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                + Nova Regulagem
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {adjustments.map((adj, idx) => (
                <AdjustmentCard key={adj.id} adj={adj} isLatest={idx === 0} farmId={farmId} talhaoId={talhaoId} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── AdjustmentCard ──────────────────────────────────────────────────────────

function AdjustmentCard({
  adj,
  isLatest,
  farmId,
  talhaoId,
}: {
  adj: ImplementAdjustment
  isLatest: boolean
  farmId: string
  talhaoId: string
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(isLatest)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const date = new Date(adj.created_at)
  const dateStr = date.toLocaleDateString('pt-BR')
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const fields: { label: string; value: string | null | undefined; highlight?: boolean }[] = [
    { label: 'Taxa aplicada', value: adj.taxa_kgha != null ? `${adj.taxa_kgha.toLocaleString('pt-BR')} kg/ha` : null, highlight: true },
    { label: 'Palhetas', value: adj.palhetas },
    { label: 'RPM Máquina', value: adj.rpm_maquina != null ? `${adj.rpm_maquina.toLocaleString('pt-BR')} rpm` : null },
    { label: 'RPM Pratos/Eixo', value: adj.rpm_pratos_eixo != null ? `${adj.rpm_pratos_eixo.toLocaleString('pt-BR')} rpm` : null },
    { label: 'Nº Bandejas', value: adj.num_bandejas != null ? String(adj.num_bandejas) : null },
    { label: 'Espaç. Bandejas', value: adj.espacamento_bandejas },
    { label: 'CV%', value: adj.cv_percent != null ? `${adj.cv_percent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%` : null },
    { label: 'Faixa de aplicação', value: adj.faixa_aplicacao },
    { label: 'Comporta', value: adj.comporta },
  ].filter((f) => f.value)

  // Dados pre-preenchidos para o formulário de edição (number → string)
  const initialData = {
    implemento:           adj.implemento           ?? '',
    taxa_kgha:            adj.taxa_kgha            != null ? String(adj.taxa_kgha)            : '',
    palhetas:             adj.palhetas             ?? '',
    rpm_maquina:          adj.rpm_maquina          != null ? String(adj.rpm_maquina)          : '',
    rpm_pratos_eixo:      adj.rpm_pratos_eixo      != null ? String(adj.rpm_pratos_eixo)      : '',
    num_bandejas:         adj.num_bandejas         != null ? String(adj.num_bandejas)         : '',
    espacamento_bandejas: adj.espacamento_bandejas ?? '',
    cv_percent:           adj.cv_percent           != null ? String(adj.cv_percent)           : '',
    faixa_aplicacao:      adj.faixa_aplicacao      ?? '',
    comporta:             adj.comporta             ?? '',
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    const res = await fetch(`/api/farms/${farmId}/implement-adjustments/${adj.id}`, {
      method: 'DELETE',
    })
    setDeleting(false)
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error ?? 'Erro ao excluir regulagem')
      setConfirmDelete(false)
    }
  }

  return (
    <div className={cn(
      'rounded-xl border bg-gray-900/40 overflow-hidden',
      isLatest ? 'border-green-500/30' : 'border-gray-800'
    )}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/20 transition-colors">
        {/* Expand toggle — área clicável */}
        <button
          onClick={() => { setExpanded((v) => !v); setEditing(false) }}
          className="flex flex-1 items-center gap-3 min-w-0 text-left"
        >
          {isLatest && (
            <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400 uppercase tracking-wider">
              Ativa
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">
              {adj.implemento ?? 'Implemento não especificado'}
            </p>
            <p className="text-xs text-gray-500">
              {adj.taxa_kgha != null && (
                <span className="text-green-400/70 mr-2">{adj.taxa_kgha.toLocaleString('pt-BR')} kg/ha</span>
              )}
              {dateStr} {timeStr}
              {adj.users?.name && <span className="ml-2">· {adj.users.name}</span>}
            </p>
          </div>
        </button>

        {/* Ações — fora do botão de expand para não colidir */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Botão Editar */}
          <button
            onClick={() => { setEditing((v) => !v); setExpanded(true); setConfirmDelete(false) }}
            title="Editar regulagem"
            className={cn(
              'rounded-md p-1.5 transition-colors',
              editing
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-gray-600 hover:bg-gray-800 hover:text-gray-300'
            )}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L18 8.625" />
            </svg>
          </button>

          {/* Botão Excluir */}
          <button
            onClick={() => { setConfirmDelete((v) => !v); setEditing(false) }}
            title="Excluir regulagem"
            className={cn(
              'rounded-md p-1.5 transition-colors',
              confirmDelete
                ? 'bg-red-500/20 text-red-400'
                : 'text-gray-600 hover:bg-gray-800 hover:text-red-400'
            )}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>

          {/* Chevron expand */}
          <button
            onClick={() => { setExpanded((v) => !v); setEditing(false) }}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            <svg
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-400">Excluir esta regulagem permanentemente?</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      )}

      {/* Erro de exclusão */}
      {deleteError && (
        <div className="border-t border-red-500/20 px-4 py-2">
          <p className="text-xs text-red-400">{deleteError}</p>
        </div>
      )}

      {/* Formulário de edição inline */}
      {editing && expanded && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-4">
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-amber-400/80">
            Editar Regulagem
          </h4>
          <ImplementAdjustmentForm
            farmId={farmId}
            talhaoId={talhaoId}
            adjId={adj.id}
            initialData={initialData}
            onSuccess={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {/* Detalhes expandidos (não mostra quando editando) */}
      {expanded && !editing && fields.length > 0 && (
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.label}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider">{f.label}</p>
                <p className={cn('text-sm', f.highlight ? 'font-semibold text-green-400' : 'text-gray-300')}>
                  {f.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {expanded && !editing && fields.length === 0 && (
        <div className="border-t border-gray-800 px-4 py-3">
          <p className="text-xs text-gray-600 italic">Nenhum detalhe adicional registrado.</p>
        </div>
      )}
    </div>
  )
}
