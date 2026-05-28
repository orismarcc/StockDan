import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Format  = 'pdf' | 'xlsx'
type Section = 'summary' | 'transactions' | 'by_insumo' | 'by_talhao' | 'operators'
type RGB     = [number, number, number]

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
  if (!dateRe.test(from) || !dateRe.test(to))
    return NextResponse.json({ error: 'Parâmetro de data inválido.' }, { status: 400 })

  if (format !== 'pdf' && format !== 'xlsx')
    return NextResponse.json({ error: 'Formato inválido. Use pdf ou xlsx.' }, { status: 400 })

  const supabase = createServerClient()

  // 1. Accessible farm IDs
  let farmIds: string[] = []
  if (session.role === 'admin') {
    const { data } = await supabase.from('farms').select('id').eq('owner_id', session.id)
    farmIds = (data ?? []).map((f: { id: string }) => f.id)
  } else {
    const { data } = await supabase.from('farm_users').select('farm_id').eq('user_id', session.id)
    farmIds = (data ?? []).map((r: { farm_id: string }) => r.farm_id)
  }

  const targetFarmIds = farmId && farmIds.includes(farmId) ? [farmId] : farmIds
  if (targetFarmIds.length === 0) return NextResponse.json({ error: 'Sem acesso.' }, { status: 403 })

  // 2. Farm names
  const { data: farmsData } = await supabase.from('farms').select('id, name').in('id', targetFarmIds)

  // 3. Talhoes + insumos
  const [{ data: talhoesData }, { data: insumosData }] = await Promise.all([
    supabase.from('talhoes').select('id, name, area_ha').in('farm_id', targetFarmIds),
    supabase.from('insumos').select('id, title').in('farm_id', targetFarmIds),
  ])

  // 4. Transactions
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

  const talhaoMap = Object.fromEntries((talhoesData ?? []).map((t: { id: string; name: string; area_ha: number }) => [t.id, t]))
  const insumoMap = Object.fromEntries((insumosData  ?? []).map((i: { id: string; title: string }) => [i.id, i.title]))
  const farmName  = farmsData?.map((f: { name: string }) => f.name).join(', ') ?? 'Fazendas'

  const txs = (txData ?? []) as unknown as {
    id: string; insumo_id: string; talhao_id: string | null
    user_id: string | null; quantity: number; area_ha: number | null
    date: string; notes: string | null
    users: { name: string }[] | null
  }[]

  const userMap = Object.fromEntries(
    txs
      .filter(t => t.user_id && t.users && t.users.length > 0)
      .map(t => [t.user_id as string, t.users![0].name])
  )

  // ─── Shared aggregation (used by both PDF and XLSX) ──────────────────────────
  type AggEntry = { qty: number; area: number; count: number }

  const totalKg   = txs.reduce((s, t) => s + Number(t.quantity), 0)
  const totalArea = txs.filter(t => t.area_ha && t.area_ha > 0).reduce((s, t) => s + Number(t.area_ha), 0)
  const avgKgHa   = totalArea > 0 ? totalKg / totalArea : null

  const byInsumo: Record<string, AggEntry> = {}
  for (const t of txs) {
    if (!byInsumo[t.insumo_id]) byInsumo[t.insumo_id] = { qty: 0, area: 0, count: 0 }
    byInsumo[t.insumo_id].qty   += Number(t.quantity)
    byInsumo[t.insumo_id].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
    byInsumo[t.insumo_id].count += 1
  }

  const byTalhao: Record<string, AggEntry> = {}
  for (const t of txs) {
    if (!t.talhao_id) continue
    if (!byTalhao[t.talhao_id]) byTalhao[t.talhao_id] = { qty: 0, area: 0, count: 0 }
    byTalhao[t.talhao_id].qty   += Number(t.quantity)
    byTalhao[t.talhao_id].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
    byTalhao[t.talhao_id].count += 1
  }

  const byUser: Record<string, AggEntry> = {}
  for (const t of txs) {
    const uid = t.user_id ?? '__unknown__'
    if (!byUser[uid]) byUser[uid] = { qty: 0, area: 0, count: 0 }
    byUser[uid].qty   += Number(t.quantity)
    byUser[uid].area  += t.area_ha && t.area_ha > 0 ? Number(t.area_ha) : 0
    byUser[uid].count += 1
  }

  // ─── PDF ────────────────────────────────────────────────────────────────────
  if (format === 'pdf') {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    // ── Setup ──────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    const PW = 297, PH = 210
    const ML = 14, MR = 14
    const CW = PW - ML - MR   // 269 mm
    const HDR = 9              // header bar height
    const FTR = 7              // footer bar height
    const CT  = HDR + 4       // content top (y = 13)
    const CB  = PH - FTR      // content bottom (y = 203)

    const period = `${fmt(from)} a ${fmt(to)}`

    // Palette — alinhada ao tema do projeto (dark, green-500 brand)
    const GREEN      : RGB = [34, 197, 94]   // green-500 — brand (#22c55e)
    const GREEN_DARK : RGB = [21, 128, 61]   // green-700 — texto branco sobre fundo verde
    const DARK       : RGB = [17, 24, 39]    // gray-900
    const GRAY800    : RGB = [31, 41, 55]    // gray-800
    const GRAY600    : RGB = [75, 85, 99]    // gray-600
    const GRAY500    : RGB = [107, 114, 128] // gray-500
    const GRAY400    : RGB = [156, 163, 175] // gray-400
    const GRAY300    : RGB = [209, 213, 219] // gray-300
    const GRAY200    : RGB = [229, 231, 235] // gray-200
    const GRAY100    : RGB = [243, 244, 246] // gray-100
    const GRAY050    : RGB = [249, 250, 251] // gray-50
    const WHITE      : RGB = [255, 255, 255]
    const BLUE       : RGB = [59, 130, 246]  // blue-500
    const AMBER      : RGB = [245, 158, 11]  // amber-500
    const AMBER_DARK : RGB = [180, 113, 0]   // amber-700 — texto branco sobre âmbar
    const PURPLE     : RGB = [139, 92, 246]  // purple-500
    const RED        : RGB = [239, 68, 68]   // red-500
    const EMERALD    : RGB = [16, 185, 129]  // emerald-500
    const CYAN       : RGB = [6, 182, 212]   // cyan-500
    const ORANGE     : RGB = [249, 115, 22]  // orange-500

    // Paleta dos gráficos de barras — cores do projeto Tailwind
    const BAR_PALETTE: RGB[] = [GREEN, BLUE, AMBER, PURPLE, RED, EMERALD, CYAN, ORANGE]

    const setF = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
    const setT = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
    const setD = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

    // ── Page chrome (header bar + footer bar) ──────────────────────────────
    function drawPageChrome() {
      const pn = doc.getNumberOfPages()

      setF(GREEN_DARK)
      doc.rect(0, 0, PW, HDR, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setT(WHITE)
      doc.text('STOCKDAN', ML, 6.2)

      doc.setFontSize(7.5)
      setT([187, 247, 208] as RGB)
      doc.text('·', ML + 33, 6.2)

      doc.setFont('helvetica', 'normal')
      doc.text('RELATÓRIO DE APLICAÇÕES', ML + 37, 6.2)

      doc.setFontSize(7)
      doc.text(`${farmName}   ·   ${period}`, PW - MR, 6.2, { align: 'right' })

      // Footer
      setF(GRAY100)
      doc.rect(0, PH - FTR, PW, FTR, 'F')
      setD(GRAY300)
      doc.setLineWidth(0.2)
      doc.line(0, PH - FTR, PW, PH - FTR)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      setT(GRAY500)
      doc.text('StockDan — Sistema de Gestão de Insumos Agrícolas', ML, PH - 2.2)
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, PW / 2, PH - 2.2, { align: 'center' })
      doc.text(`Página ${pn}`, PW - MR, PH - 2.2, { align: 'right' })
    }

    // ── KPI card ───────────────────────────────────────────────────────────
    function drawKpiCard(x: number, y: number, w: number, h: number, value: string, label: string, sub: string | null, accent: RGB) {
      setF(GRAY050)
      doc.roundedRect(x, y, w, h, 2, 2, 'F')

      // Accent strip (top rounded, bottom straight)
      setF(accent)
      doc.roundedRect(x, y, w, 2.5, 2, 2, 'F')
      doc.rect(x, y + 1.5, w, 1, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      setT(DARK)
      doc.text(value, x + w / 2, y + 17, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      setT(GRAY500)
      doc.text(label, x + w / 2, y + 23.5, { align: 'center' })

      if (sub) {
        doc.setFontSize(6.5)
        setT(GRAY400)
        doc.text(sub, x + w / 2, y + 28.5, { align: 'center' })
      }
    }

    // ── Vertical bar chart ─────────────────────────────────────────────────
    function drawVBar(x: number, y: number, w: number, h: number, title: string, items: { label: string; val: number; color: RGB }[]) {
      setF(GRAY050)
      doc.roundedRect(x, y, w, h, 2, 2, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setT(DARK)
      doc.text(title, x + 5, y + 7.5)

      if (items.length === 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        setT(GRAY500)
        doc.text('Sem dados', x + w / 2, y + h / 2 + 4, { align: 'center' })
        return
      }

      const pL = 5, pR = 5, pT = 13, pB = 13
      const cX = x + pL, cW = w - pL - pR
      const cY = y + pT, cH = h - pT - pB
      const axisY = cY + cH

      setD(GRAY300)
      doc.setLineWidth(0.25)
      doc.line(cX, axisY, cX + cW, axisY)

      const maxV = Math.max(...items.map(d => d.val), 1)
      const n = items.length
      const barW = Math.max(4, Math.min(20, (cW / n) * 0.58))
      const gap = (cW - n * barW) / (n + 1)

      items.forEach((d, i) => {
        const bh = (d.val / maxV) * cH * 0.88
        const bx = cX + gap + i * (barW + gap)
        const by = axisY - bh

        if (bh > 0.5) {
          setF(d.color)
          doc.roundedRect(bx, by, barW, bh, 1, 1, 'F')
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.5)
        setT(DARK)
        const vs = d.val >= 1000
          ? (d.val / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k'
          : fmtNum(d.val, 0)
        doc.text(vs, bx + barW / 2, Math.max(by - 1.5, cY + 4), { align: 'center' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.5)
        setT(GRAY600)
        const lbl = d.label.length > 11 ? d.label.slice(0, 10) + '…' : d.label
        doc.text(lbl, bx + barW / 2, axisY + 4.5, { align: 'center' })
      })
    }

    // ── Horizontal bar chart ───────────────────────────────────────────────
    function drawHBar(x: number, y: number, w: number, h: number, title: string, items: { label: string; val: number; maxV: number; suffix: string }[], barColor: RGB) {
      setF(GRAY050)
      doc.roundedRect(x, y, w, h, 2, 2, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      setT(DARK)
      doc.text(title, x + 5, y + 7.5)

      if (items.length === 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        setT(GRAY500)
        doc.text('Sem dados', x + w / 2, y + h / 2 + 4, { align: 'center' })
        return
      }

      const slice   = items.slice(0, 8)
      const lblW    = 28
      const valW    = 22
      const trackX  = x + 5 + lblW + 2
      const trackW  = w - 10 - lblW - valW - 2
      const availH  = h - 15
      const rowH    = availH / slice.length

      slice.forEach((d, i) => {
        const cy    = y + 14 + i * rowH + rowH / 2
        const fillW = d.maxV > 0 ? (d.val / d.maxV) * trackW : 0

        setF(GRAY200)
        doc.roundedRect(trackX, cy - 2.5, trackW, 5, 1.5, 1.5, 'F')

        if (fillW > 0) {
          setF(barColor)
          doc.roundedRect(trackX, cy - 2.5, fillW, 5, 1.5, 1.5, 'F')
        }

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        setT(GRAY600)
        const lbl = d.label.length > 15 ? d.label.slice(0, 14) + '…' : d.label
        doc.text(lbl, trackX - 2, cy + 1.5, { align: 'right' })

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        setT(DARK)
        doc.text(d.suffix, trackX + trackW + 2, cy + 1.5)
      })
    }

    // ── Section divider ────────────────────────────────────────────────────
    function drawSectionHeader(y: number, title: string, accent: RGB): number {
      setF(accent)
      doc.roundedRect(ML, y, 3.5, 7.5, 0.5, 0.5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      setT(DARK)
      doc.text(title, ML + 6.5, y + 5.5)
      setD(GRAY200)
      doc.setLineWidth(0.25)
      doc.line(ML, y + 9.5, PW - MR, y + 9.5)
      return y + 13
    }

    // ── Add page with chrome ───────────────────────────────────────────────
    function addPage(): number {
      doc.addPage()
      drawPageChrome()
      return CT
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PAGE 1 — Dashboard
    // ══════════════════════════════════════════════════════════════════════
    drawPageChrome()

    let y = CT

    // Title block
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    setT(DARK)
    doc.text(`Relatório — ${farmName}`, ML, y + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setT(GRAY500)
    doc.text(`Período: ${fmt(from)} a ${fmt(to)}`, ML, y + 13.5)
    doc.text(`${txs.length} aplicação${txs.length !== 1 ? 'ões' : ''} registradas no período`, ML + 75, y + 13.5)

    setD(GRAY200)
    doc.setLineWidth(0.3)
    doc.line(ML, y + 17, PW - MR, y + 17)

    y += 21

    // KPI cards
    if (sections.includes('summary')) {
      const cardW = (CW - 9) / 4
      const cardH = 32

      drawKpiCard(ML,                   y, cardW, cardH, txs.length.toString(),                                 'Aplicações',        'no período',             BLUE)
      drawKpiCard(ML + (cardW + 3),     y, cardW, cardH, fmtNum(totalKg, 0),                                    'Total (kg)',        'insumos aplicados',       GREEN)
      drawKpiCard(ML + (cardW + 3) * 2, y, cardW, cardH, fmtNum(totalArea),                                     'Área total (ha)',   'com área registrada',    AMBER)
      drawKpiCard(ML + (cardW + 3) * 3, y, cardW, cardH, avgKgHa ? fmtNum(avgKgHa, 1) : '—', 'Taxa média (kg/ha)', avgKgHa ? 'referência do período' : 'sem área', PURPLE)

      y += cardH + 6
    }

    // Charts
    const showInsumoChart = sections.includes('by_insumo')
    const showTalhaoChart = sections.includes('by_talhao')

    if (showInsumoChart || showTalhaoChart) {
      const chartH = 63

      const insumoItems = Object.entries(byInsumo)
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, 8)
        .map(([id, d], i) => ({
          label: insumoMap[id] ?? id,
          val:   d.qty,
          color: BAR_PALETTE[i % BAR_PALETTE.length],
        }))

      const talhaoMaxQty = Math.max(...Object.values(byTalhao).map(d => d.qty), 1)
      const talhaoItems  = Object.entries(byTalhao)
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, 8)
        .map(([id, d]) => ({
          label:  talhaoMap[id]?.name ?? id,
          val:    d.qty,
          maxV:   talhaoMaxQty,
          suffix: fmtNum(d.qty, 0) + ' kg',
        }))

      if (showInsumoChart && showTalhaoChart) {
        const half = (CW - 4) / 2
        drawVBar(ML,            y, half, chartH, 'Consumo por Insumo (kg)',         insumoItems)
        drawHBar(ML + half + 4, y, half, chartH, 'Total aplicado por Talhão (kg)', talhaoItems, AMBER)
      } else if (showInsumoChart) {
        drawVBar(ML, y, CW, chartH, 'Consumo por Insumo (kg)', insumoItems)
      } else {
        drawHBar(ML, y, CW, chartH, 'Total aplicado por Talhão (kg)', talhaoItems, AMBER)
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  TABLES — each starts on a fresh page
    // ══════════════════════════════════════════════════════════════════════

    // Transactions
    if (sections.includes('transactions')) {
      y = addPage()
      y = drawSectionHeader(y, 'Listagem de Aplicações', BLUE)

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR, top: CT, bottom: FTR + 3 },
        head: [['Data', 'Insumo', 'Talhão', 'Operador', 'Qtd (kg)', 'Área (ha)', 'kg/ha', 'Observação']],
        body: txs.map(t => [
          fmt(t.date),
          insumoMap[t.insumo_id] ?? '—',
          t.talhao_id ? (talhaoMap[t.talhao_id]?.name ?? '—') : '—',
          t.user_id   ? (userMap[t.user_id]               ?? '—') : '—',
          fmtNum(Number(t.quantity), 1),
          t.area_ha ? fmtNum(Number(t.area_ha)) : '—',
          t.area_ha && t.area_ha > 0 ? fmtNum(Number(t.quantity) / Number(t.area_ha), 1) : '—',
          t.notes ?? '',
        ]),
        foot: [['', '', '', 'TOTAL', fmtNum(totalKg, 1), fmtNum(totalArea), '', '']],
        styles:             { fontSize: 8.5, cellPadding: 2.8, lineColor: GRAY200 as number[], lineWidth: 0.2, overflow: 'linebreak' },
        headStyles:         { fillColor: BLUE    as number[], textColor: WHITE as number[], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: GRAY050 as number[] },
        footStyles:         { fillColor: GRAY800 as number[], textColor: WHITE as number[], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 18 },
          4: { halign: 'right', cellWidth: 22 },
          5: { halign: 'right', cellWidth: 22 },
          6: { halign: 'right', cellWidth: 16 },
        },
        didDrawPage: () => { drawPageChrome() },
      })
    }

    // By insumo
    if (sections.includes('by_insumo')) {
      y = addPage()
      y = drawSectionHeader(y, 'Resumo por Insumo', GREEN)

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR, top: CT, bottom: FTR + 3 },
        head: [['Insumo', 'Aplicações', 'Total (kg)', 'Área (ha)', 'Taxa média (kg/ha)', '% do total kg']],
        body: Object.entries(byInsumo)
          .sort(([, a], [, b]) => b.qty - a.qty)
          .map(([id, { qty, area, count }]) => [
            insumoMap[id] ?? id,
            count.toString(),
            fmtNum(qty, 1),
            fmtNum(area),
            area > 0 ? fmtNum(qty / area, 1) : '—',
            totalKg > 0 ? fmtNum((qty / totalKg) * 100, 1) + '%' : '—',
          ]),
        styles:             { fontSize: 9, cellPadding: 3, lineColor: GRAY200 as number[], lineWidth: 0.2 },
        headStyles:         { fillColor: GREEN_DARK as number[], textColor: WHITE as number[], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: GRAY050 as number[] },
        columnStyles: {
          1: { halign: 'center', cellWidth: 28 },
          2: { halign: 'right',  cellWidth: 32 },
          3: { halign: 'right',  cellWidth: 30 },
          4: { halign: 'right',  cellWidth: 40 },
          5: { halign: 'right',  cellWidth: 28 },
        },
        didDrawPage: () => { drawPageChrome() },
      })
    }

    // By talhao
    if (sections.includes('by_talhao')) {
      y = addPage()
      y = drawSectionHeader(y, 'Resumo por Talhão', AMBER)

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR, top: CT, bottom: FTR + 3 },
        head: [['Talhão', 'Área total (ha)', 'Aplicações', 'Total (kg)', 'Área aplicada (ha)', 'Cobertura (%)', 'Taxa (kg/ha)']],
        body: Object.entries(byTalhao)
          .sort(([, a], [, b]) => b.qty - a.qty)
          .map(([id, { qty, area, count }]) => {
            const talhao  = talhaoMap[id]
            const totalHa = talhao ? Number(talhao.area_ha) : 0
            const pct     = totalHa > 0 ? Math.min(100, (area / totalHa) * 100) : null
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
        styles:             { fontSize: 9, cellPadding: 3, lineColor: GRAY200 as number[], lineWidth: 0.2 },
        headStyles:         { fillColor: AMBER_DARK as number[], textColor: WHITE as number[], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: GRAY050 as number[] },
        columnStyles: {
          1: { halign: 'right',  cellWidth: 32 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'right',  cellWidth: 28 },
          4: { halign: 'right',  cellWidth: 36 },
          5: { halign: 'right',  cellWidth: 30 },
          6: { halign: 'right',  cellWidth: 28 },
        },
        didDrawPage: () => { drawPageChrome() },
      })
    }

    // Operators
    if (sections.includes('operators')) {
      y = addPage()
      y = drawSectionHeader(y, 'Desempenho dos Operadores', PURPLE)

      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR, top: CT, bottom: FTR + 3 },
        head: [['Operador', 'Registros', 'Total (kg)', 'Área trabalhada (ha)', 'Média/registro (ha)', '% do total kg']],
        body: Object.entries(byUser)
          .sort(([, a], [, b]) => b.qty - a.qty)
          .map(([uid, { qty, area, count }]) => [
            userMap[uid] ?? 'Desconhecido',
            count.toString(),
            fmtNum(qty, 1),
            fmtNum(area),
            count > 0 ? fmtNum(area / count) : '—',
            totalKg > 0 ? fmtNum((qty / totalKg) * 100, 1) + '%' : '—',
          ]),
        styles:             { fontSize: 9, cellPadding: 3, lineColor: GRAY200 as number[], lineWidth: 0.2 },
        headStyles:         { fillColor: PURPLE  as number[], textColor: WHITE as number[], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: GRAY050 as number[] },
        columnStyles: {
          1: { halign: 'center', cellWidth: 25 },
          2: { halign: 'right',  cellWidth: 30 },
          3: { halign: 'right',  cellWidth: 42 },
          4: { halign: 'right',  cellWidth: 40 },
          5: { halign: 'right',  cellWidth: 28 },
        },
        didDrawPage: () => { drawPageChrome() },
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

  // Helper: aplica largura de colunas e auto-filtro em uma planilha
  function xlsxMeta(ws: ReturnType<typeof XLSX.utils.json_to_sheet>, colWidths: number[], filterCols: number) {
    ws['!cols'] = colWidths.map(wch => ({ wch }))
    const lastCol = String.fromCharCode(64 + filterCols) // A=1, B=2...
    ws['!autofilter'] = { ref: `A1:${lastCol}1` }
  }

  if (sections.includes('transactions') || sections.includes('summary')) {
    const totalKgXlsx   = txs.reduce((s, t) => s + Number(t.quantity), 0)
    const totalAreaXlsx = txs.filter(t => t.area_ha && t.area_ha > 0).reduce((s, t) => s + Number(t.area_ha), 0)

    const rows = [
      // Cabeçalho de contexto
      { Data: `Fazenda: ${farmName}`, Insumo: `Período: ${fmt(from)} a ${fmt(to)}`, Talhão: '', Operador: '', 'Quantidade (kg)': null, 'Área (ha)': null, 'kg/ha': null, Observação: '' },
      // Linha em branco separadora
      { Data: '', Insumo: '', Talhão: '', Operador: '', 'Quantidade (kg)': null, 'Área (ha)': null, 'kg/ha': null, Observação: '' },
      // Dados
      ...txs.map(t => ({
        Data:             fmt(t.date),
        Insumo:           insumoMap[t.insumo_id] ?? '—',
        Talhão:           t.talhao_id ? (talhaoMap[t.talhao_id]?.name ?? '—') : '—',
        Operador:         t.user_id ? (userMap[t.user_id] ?? '—') : '—',
        'Quantidade (kg)': Number(t.quantity),
        'Área (ha)':       t.area_ha ? Number(t.area_ha) : null,
        'kg/ha':           t.area_ha && t.area_ha > 0 ? Number(t.quantity) / Number(t.area_ha) : null,
        Observação:        t.notes ?? '',
      })),
      // Linha em branco
      { Data: '', Insumo: '', Talhão: '', Operador: '', 'Quantidade (kg)': null, 'Área (ha)': null, 'kg/ha': null, Observação: '' },
      // Totais
      { Data: 'TOTAL', Insumo: `${txs.length} aplicações`, Talhão: '', Operador: '', 'Quantidade (kg)': totalKgXlsx, 'Área (ha)': totalAreaXlsx, 'kg/ha': totalAreaXlsx > 0 ? totalKgXlsx / totalAreaXlsx : null, Observação: '' },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    xlsxMeta(ws, [12, 24, 18, 18, 16, 12, 10, 35], 8)
    XLSX.utils.book_append_sheet(wb, ws, 'Aplicações')
  }

  if (sections.includes('by_insumo')) {
    const totalKgXlsx = Object.values(byInsumo).reduce((s, d) => s + d.qty, 0)
    const rows = Object.entries(byInsumo)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .map(([id, { qty, area, count }]) => ({
        Insumo: insumoMap[id] ?? id,
        Aplicações:          count,
        'Total (kg)':        qty,
        'Área total (ha)':   area || null,
        'Taxa média (kg/ha)': area > 0 ? qty / area : null,
        '% do total':        totalKgXlsx > 0 ? qty / totalKgXlsx : null,
      }))
    const ws = XLSX.utils.json_to_sheet(rows)
    xlsxMeta(ws, [28, 12, 14, 16, 18, 12], 6)
    XLSX.utils.book_append_sheet(wb, ws, 'Por Insumo')
  }

  if (sections.includes('by_talhao')) {
    const rows = Object.entries(byTalhao)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .map(([id, { qty, area, count }]) => {
        const talhao  = talhaoMap[id]
        const totalHa = talhao ? Number(talhao.area_ha) : 0
        return {
          Talhão:               talhao?.name ?? id,
          'Área cadastrada (ha)': totalHa || null,
          Aplicações:           count,
          'Total (kg)':         qty,
          'Área aplicada (ha)': area || null,
          'Cobertura (%)':      totalHa > 0 ? Math.min(100, (area / totalHa) * 100) : null,
          'Taxa média (kg/ha)': area > 0 ? qty / area : null,
        }
      })
    const ws = XLSX.utils.json_to_sheet(rows)
    xlsxMeta(ws, [22, 20, 12, 14, 18, 14, 18], 7)
    XLSX.utils.book_append_sheet(wb, ws, 'Por Talhão')
  }

  if (sections.includes('operators')) {
    const totalKgXlsx = Object.values(byUser).reduce((s, d) => s + d.qty, 0)
    const rows = Object.entries(byUser)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .map(([uid, { qty, area, count }]) => ({
        Operador:               userMap[uid] ?? 'Desconhecido',
        Aplicações:             count,
        'Total (kg)':           qty,
        'Área trabalhada (ha)': area || null,
        'Média/aplicação (ha)': count > 0 ? area / count : null,
        '% do total kg':        totalKgXlsx > 0 ? qty / totalKgXlsx : null,
      }))
    const ws = XLSX.utils.json_to_sheet(rows)
    xlsxMeta(ws, [24, 12, 14, 20, 20, 14], 6)
    XLSX.utils.book_append_sheet(wb, ws, 'Operadores')
  }

  if (wb.SheetNames.length === 0)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), 'Vazio')

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(xlsxBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="stockdan-relatorio-${from}-${to}.xlsx"`,
    },
  })
}
