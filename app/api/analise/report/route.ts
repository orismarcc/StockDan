// app/api/analise/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Format = 'pdf' | 'xlsx'
type Section = 'summary' | 'transactions' | 'by_insumo' | 'by_talhao' | 'operators'

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  const [y, m, day] = parts
  return `${day}/${m}/${y}`
}

function fmtNum(n: number | null, decimals = 2) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export async function GET(req: NextRequest) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const format    = (sp.get('format') ?? 'pdf') as Format
  const farmId    = sp.get('farm_id') ?? ''
  const from      = sp.get('from') ?? new Date().toISOString().split('T')[0]
  const to        = sp.get('to')   ?? new Date().toISOString().split('T')[0]
  const talhaoIds = sp.get('talhao_ids')?.split(',').filter(Boolean) ?? []
  const insumoIds = sp.get('insumo_ids')?.split(',').filter(Boolean) ?? []
  const sections  = (sp.get('sections')?.split(',').filter(Boolean) ?? []) as Section[]

  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return NextResponse.json({ error: 'Parâmetro de data inválido.' }, { status: 400 })
  }

  if (format !== 'pdf' && format !== 'xlsx') {
    return NextResponse.json({ error: 'Formato inválido. Use pdf ou xlsx.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // 1. Determine accessible farm IDs
  let farmIds: string[] = []
  if (session.role === 'admin') {
    const { data } = await supabase.from('farms').select('id').eq('owner_id', session.id)
    farmIds = (data ?? []).map((f: { id: string }) => f.id)
  } else {
    const { data } = await supabase.from('farm_users').select('farm_id').eq('user_id', session.id)
    farmIds = (data ?? []).map((r: { farm_id: string }) => r.farm_id)
  }

  // If farmId requested, validate access
  const targetFarmIds = farmId && farmIds.includes(farmId) ? [farmId] : farmIds
  if (targetFarmIds.length === 0) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })

  // 2. Fetch farm name(s) for header
  const { data: farmsData } = await supabase
    .from('farms')
    .select('id, name')
    .in('id', targetFarmIds)

  // 3. Fetch talhoes + insumos
  const [{ data: talhoesData }, { data: insumosData }] = await Promise.all([
    supabase.from('talhoes').select('id, name, area_ha').in('farm_id', targetFarmIds),
    supabase.from('insumos').select('id, title').in('farm_id', targetFarmIds),
  ])

  // 4. Fetch transactions — inclui users(name) via JOIN para evitar segundo round-trip
  let txQuery = supabase
    .from('transactions')
    .select('id, insumo_id, talhao_id, user_id, quantity, area_ha, date, notes, users(name)')
    .in('farm_id', targetFarmIds)
    .eq('type', 'saida')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })

  if (session.role === 'operario') txQuery = txQuery.eq('user_id', session.id)
  if (talhaoIds.length > 0) txQuery = txQuery.in('talhao_id', talhaoIds)
  if (insumoIds.length > 0) txQuery = txQuery.in('insumo_id', insumoIds)

  const { data: txData, error: txError } = await txQuery
  if (txError) return NextResponse.json({ error: 'Erro ao consultar transações.' }, { status: 500 })

  // Build lookup maps (user names vêm inline do JOIN)
  const talhaoMap = Object.fromEntries((talhoesData ?? []).map((t: { id: string; name: string; area_ha: number }) => [t.id, t]))
  const insumoMap = Object.fromEntries((insumosData  ?? []).map((i: { id: string; title: string }) => [i.id, i.title]))
  const farmName  = farmsData?.map((f: { name: string }) => f.name).join(', ') ?? 'Fazendas'

  const txs = (txData ?? []) as unknown as {
    id: string; insumo_id: string; talhao_id: string | null
    user_id: string | null; quantity: number; area_ha: number | null
    date: string; notes: string | null
    users: { name: string }[] | null
  }[]

  // Helper: resolve nome do usuário a partir do JOIN embutido
  const userMap = Object.fromEntries(
    txs
      .filter(t => t.user_id && t.users && t.users.length > 0)
      .map(t => [t.user_id as string, t.users![0].name])
  )

  // ─── PDF ────────────────────────────────────────────────────────────────────
  if (format === 'pdf') {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    // Header
    doc.setFontSize(16)
    doc.setTextColor(30, 30, 30)
    doc.text('StockDan — Relatório de Aplicações', 14, 16)
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Fazenda: ${farmName}   Período: ${fmt(from)} a ${fmt(to)}`, 14, 23)
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28)

    let y = 35

    // Summary section
    if (sections.includes('summary')) {
      const totalKg   = txs.reduce((s, t) => s + Number(t.quantity), 0)
      const totalArea = txs.filter(t => t.area_ha && t.area_ha > 0).reduce((s, t) => s + Number(t.area_ha), 0)
      const avgKgHa   = totalArea > 0 ? totalKg / totalArea : null

      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text('Resumo Geral', 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Aplicações', 'Total kg', 'Área trabalhada (ha)', 'Taxa média (kg/ha)']],
        body: [[
          txs.length.toString(),
          fmtNum(totalKg, 0),
          fmtNum(totalArea),
          fmtNum(avgKgHa, 1),
        ]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [34, 197, 94] },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    // Transactions section
    if (sections.includes('transactions')) {
      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text('Listagem de Aplicações', 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Data', 'Insumo', 'Talhão', 'Operador', 'Qtd (kg)', 'Área (ha)', 'kg/ha', 'Obs.']],
        body: txs.map(t => [
          fmt(t.date),
          insumoMap[t.insumo_id] ?? '—',
          t.talhao_id ? (talhaoMap[t.talhao_id]?.name ?? '—') : '—',
          t.user_id ? (userMap[t.user_id] ?? '—') : '—',
          fmtNum(Number(t.quantity), 1),
          t.area_ha ? fmtNum(Number(t.area_ha)) : '—',
          t.area_ha && t.area_ha > 0 ? fmtNum(Number(t.quantity) / Number(t.area_ha), 1) : '—',
          t.notes ?? '',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
        foot: [['', '', '', 'TOTAL',
          fmtNum(txs.reduce((s, t) => s + Number(t.quantity), 0), 1),
          fmtNum(txs.filter(t => t.area_ha && t.area_ha > 0).reduce((s, t) => s + Number(t.area_ha), 0)),
          '', '']],
        footStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold' },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    // By insumo
    if (sections.includes('by_insumo')) {
      const byInsumo: Record<string, { qty: number; area: number; count: number }> = {}
      for (const t of txs) {
        if (!byInsumo[t.insumo_id]) byInsumo[t.insumo_id] = { qty: 0, area: 0, count: 0 }
        byInsumo[t.insumo_id].qty   += Number(t.quantity)
        byInsumo[t.insumo_id].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
        byInsumo[t.insumo_id].count += 1
      }

      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text('Resumo por Insumo', 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Insumo', 'Registros', 'Total kg', 'Área (ha)', 'Taxa média (kg/ha)']],
        body: Object.entries(byInsumo).map(([id, { qty, area, count }]) => [
          insumoMap[id] ?? id,
          count.toString(),
          fmtNum(qty, 1),
          fmtNum(area),
          area > 0 ? fmtNum(qty / area, 1) : '—',
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [139, 92, 246] },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    // By talhao
    if (sections.includes('by_talhao')) {
      const byTalhao: Record<string, { qty: number; area: number; count: number }> = {}
      for (const t of txs) {
        if (!t.talhao_id) continue
        if (!byTalhao[t.talhao_id]) byTalhao[t.talhao_id] = { qty: 0, area: 0, count: 0 }
        byTalhao[t.talhao_id].qty   += Number(t.quantity)
        byTalhao[t.talhao_id].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
        byTalhao[t.talhao_id].count += 1
      }

      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text('Resumo por Talhão', 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Talhão', 'Área total (ha)', 'Registros', 'Total kg', 'Área aplicada (ha)', 'Cobertura (%)', 'Taxa (kg/ha)']],
        body: Object.entries(byTalhao).map(([id, { qty, area, count }]) => {
          const talhao = talhaoMap[id]
          const totalHa = talhao ? Number(talhao.area_ha) : 0
          const pct = totalHa > 0 ? Math.min(100, (area / totalHa) * 100) : null
          return [
            talhao?.name ?? id,
            fmtNum(totalHa),
            count.toString(),
            fmtNum(qty, 1),
            fmtNum(area),
            pct != null ? fmtNum(pct, 1) + '%' : '—',
            area > 0 ? fmtNum(qty / area, 1) : '—',
          ]
        }),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [245, 158, 11] },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    // Operators
    if (sections.includes('operators')) {
      const byUser: Record<string, { qty: number; area: number; count: number }> = {}
      for (const t of txs) {
        const uid = t.user_id ?? '__unknown__'
        if (!byUser[uid]) byUser[uid] = { qty: 0, area: 0, count: 0 }
        byUser[uid].qty   += Number(t.quantity)
        byUser[uid].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
        byUser[uid].count += 1
      }

      doc.setFontSize(11)
      doc.setTextColor(30, 30, 30)
      doc.text('Desempenho dos Operadores', 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Operador', 'Registros', 'Total kg', 'Área trabalhada (ha)', 'Média/registro (ha)']],
        body: Object.entries(byUser)
          .sort(([, a], [, b]) => b.area - a.area)
          .map(([uid, { qty, area, count }]) => [
            userMap[uid] ?? 'Desconhecido',
            count.toString(),
            fmtNum(qty, 1),
            fmtNum(area),
            count > 0 ? fmtNum(area / count) : '—',
          ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [239, 68, 68] },
      })
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="stockdan-relatorio-${from}-${to}.pdf"`,
      },
    })
  }

  // ─── EXCEL ──────────────────────────────────────────────────────────────────
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  if (sections.includes('transactions') || sections.includes('summary')) {
    const rows = txs.map(t => ({
      Data: fmt(t.date),
      Insumo: insumoMap[t.insumo_id] ?? '—',
      Talhão: t.talhao_id ? (talhaoMap[t.talhao_id]?.name ?? '—') : '—',
      Operador: t.user_id ? (userMap[t.user_id] ?? '—') : '—',
      'Quantidade (kg)': Number(t.quantity),
      'Área (ha)': t.area_ha ? Number(t.area_ha) : null,
      'kg/ha': t.area_ha && t.area_ha > 0 ? Number(t.quantity) / Number(t.area_ha) : null,
      Observação: t.notes ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Aplicações')
  }

  if (sections.includes('by_insumo')) {
    const byInsumo: Record<string, { qty: number; area: number; count: number }> = {}
    for (const t of txs) {
      if (!byInsumo[t.insumo_id]) byInsumo[t.insumo_id] = { qty: 0, area: 0, count: 0 }
      byInsumo[t.insumo_id].qty   += Number(t.quantity)
      byInsumo[t.insumo_id].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
      byInsumo[t.insumo_id].count += 1
    }
    const rows = Object.entries(byInsumo).map(([id, { qty, area, count }]) => ({
      Insumo: insumoMap[id] ?? id,
      Registros: count,
      'Total kg': qty,
      'Área (ha)': area,
      'kg/ha médio': area > 0 ? qty / area : null,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Por Insumo')
  }

  if (sections.includes('by_talhao')) {
    const byTalhao: Record<string, { qty: number; area: number; count: number }> = {}
    for (const t of txs) {
      if (!t.talhao_id) continue
      if (!byTalhao[t.talhao_id]) byTalhao[t.talhao_id] = { qty: 0, area: 0, count: 0 }
      byTalhao[t.talhao_id].qty   += Number(t.quantity)
      byTalhao[t.talhao_id].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
      byTalhao[t.talhao_id].count += 1
    }
    const rows = Object.entries(byTalhao).map(([id, { qty, area, count }]) => {
      const talhao = talhaoMap[id]
      const totalHa = talhao ? Number(talhao.area_ha) : 0
      return {
        Talhão: talhao?.name ?? id,
        'Área total (ha)': totalHa,
        Registros: count,
        'Total kg': qty,
        'Área aplicada (ha)': area,
        'Cobertura (%)': totalHa > 0 ? Math.min(100, (area / totalHa) * 100) : null,
        'kg/ha médio': area > 0 ? qty / area : null,
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Por Talhão')
  }

  if (sections.includes('operators')) {
    const byUser: Record<string, { qty: number; area: number; count: number }> = {}
    for (const t of txs) {
      const uid = t.user_id ?? '__unknown__'
      if (!byUser[uid]) byUser[uid] = { qty: 0, area: 0, count: 0 }
      byUser[uid].qty   += Number(t.quantity)
      byUser[uid].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
      byUser[uid].count += 1
    }
    const rows = Object.entries(byUser)
      .sort(([, a], [, b]) => b.area - a.area)
      .map(([uid, { qty, area, count }]) => ({
        Operador: userMap[uid] ?? 'Desconhecido',
        Registros: count,
        'Total kg': qty,
        'Área trabalhada (ha)': area,
        'Média por registro (ha)': count > 0 ? area / count : null,
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Operadores')
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), 'Vazio')
  }

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(xlsxBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="stockdan-relatorio-${from}-${to}.xlsx"`,
    },
  })
}
