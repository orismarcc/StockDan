// lib/emailTemplate.ts
//
// Template HTML do relatório automático do StockDan.
// Usa tabelas aninhadas (padrão email) para máxima compatibilidade
// com Gmail, Outlook, Apple Mail etc.
// Identidade visual: verde #22c55e, tipografia limpa, mobile-first.

export interface EmailReportData {
  gestorName: string
  period:     string        // ex: "últimos 30 dias"
  generatedAt: string       // ex: "30/05/2026"
  farms: {
    id:          string
    name:        string
    city:        string
    state:       string
    farmer_name: string
    insumos: {
      title:        string
      unit:         string
      quantity:     number
      min_quantity: number | null
    }[]
    txCount: number          // transações no período
    totalKg: number          // kg retirados no período
  }[]
  totalAlerts: number        // insumos abaixo do mínimo
  totalTx:     number        // total transações no período
}

// ── Cores ────────────────────────────────────────────────────────────────────
const C = {
  green:      '#22c55e',
  greenDark:  '#16a34a',
  greenLight: '#dcfce7',
  white:      '#ffffff',
  bg:         '#f1f5f9',
  bodyBg:     '#ffffff',
  heading:    '#0f172a',
  text:       '#475569',
  subtle:     '#94a3b8',
  border:     '#e2e8f0',
  red:        '#ef4444',
  redLight:   '#fef2f2',
  orange:     '#f97316',
  orangeLight:'#fff7ed',
  slate50:    '#f8fafc',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function statusBadge(qty: number, min: number | null): string {
  if (qty <= 0) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${C.redLight};color:${C.red};font-size:11px;font-weight:600;">Zerado</span>`
  }
  if (min != null && qty <= min) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${C.orangeLight};color:${C.orange};font-size:11px;font-weight:600;">Crítico</span>`
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${C.greenLight};color:${C.greenDark};font-size:11px;font-weight:600;">OK</span>`
}

// ── Logo SVG do cubo (inline para compatibilidade) ───────────────────────────
const CUBE_SVG = `<svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
  <rect width="52" height="52" rx="14" fill="rgba(255,255,255,0.18)"/>
  <polygon points="26,10 40,17 26,24 12,17" fill="rgba(255,255,255,0.97)"/>
  <polygon points="40,17 40,35 26,42 26,24" fill="rgba(255,255,255,0.75)"/>
  <polygon points="12,17 12,35 26,42 26,24" fill="rgba(255,255,255,0.55)"/>
</svg>`

// ── Template principal ────────────────────────────────────────────────────────
export function buildReportEmail(data: EmailReportData): { subject: string; html: string } {
  const subject = `📊 Relatório StockDan — ${data.period} | ${data.generatedAt}`

  const alertsNote = data.totalAlerts > 0
    ? `<tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.redLight};border:1px solid #fecaca;border-radius:10px;padding:16px;">
          <tr>
            <td style="font-size:13px;color:${C.red};font-weight:600;">
              ⚠️ ${data.totalAlerts} insumo${data.totalAlerts > 1 ? 's' : ''} abaixo do estoque mínimo
            </td>
          </tr>
          <tr><td style="font-size:12px;color:#b91c1c;padding-top:4px;">
            Verifique os itens marcados como <strong>Crítico</strong> ou <strong>Zerado</strong> abaixo.
          </td></tr>
        </table>
      </td></tr>`
    : ''

  // Bloco de cada fazenda
  const farmsHtml = data.farms.map(farm => {
    const insumoRows = farm.insumos.map((ins, i) => {
      const rowBg = i % 2 === 0 ? C.white : C.slate50
      return `<tr style="background:${rowBg};">
        <td style="padding:10px 14px;font-size:13px;color:${C.heading};border-bottom:1px solid ${C.border};">${ins.title}</td>
        <td style="padding:10px 14px;font-size:13px;color:${C.text};border-bottom:1px solid ${C.border};text-align:right;">${fmt(ins.quantity)} ${ins.unit}</td>
        <td style="padding:10px 14px;font-size:13px;color:${C.subtle};border-bottom:1px solid ${C.border};text-align:right;">${ins.min_quantity != null ? fmt(ins.min_quantity) + ' ' + ins.unit : '—'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid ${C.border};text-align:center;">${statusBadge(ins.quantity, ins.min_quantity)}</td>
      </tr>`
    }).join('')

    return `
    <!-- Fazenda: ${farm.name} -->
    <tr><td style="padding:0 32px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
        <!-- Farm header -->
        <tr style="background:${C.slate50};">
          <td style="padding:16px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:15px;font-weight:700;color:${C.heading};">${farm.name}</div>
                  <div style="font-size:12px;color:${C.subtle};margin-top:2px;">${farm.farmer_name} · ${farm.city}, ${farm.state}</div>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <div style="font-size:12px;color:${C.text};">${farm.txCount} aplicaç${farm.txCount === 1 ? 'ão' : 'ões'}</div>
                  <div style="font-size:12px;color:${C.green};font-weight:600;">${fmt(farm.totalKg)} kg retirados</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Tabela de insumos -->
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:${C.slate50};">
                <th style="padding:8px 14px;font-size:11px;font-weight:600;color:${C.subtle};text-align:left;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid ${C.border};">Insumo</th>
                <th style="padding:8px 14px;font-size:11px;font-weight:600;color:${C.subtle};text-align:right;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid ${C.border};">Estoque atual</th>
                <th style="padding:8px 14px;font-size:11px;font-weight:600;color:${C.subtle};text-align:right;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid ${C.border};">Mínimo</th>
                <th style="padding:8px 14px;font-size:11px;font-weight:600;color:${C.subtle};text-align:center;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid ${C.border};">Status</th>
              </tr>
              ${insumoRows || `<tr><td colspan="4" style="padding:16px;text-align:center;font-size:13px;color:${C.subtle};">Nenhum insumo cadastrado.</td></tr>`}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.bg};padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">

        <!-- ══ HEADER ══ -->
        <tr>
          <td style="background:${C.green};border-radius:16px 16px 0 0;padding:36px 32px;text-align:center;">
            ${CUBE_SVG}
            <h1 style="margin:16px 0 4px;color:${C.white};font-size:26px;font-weight:800;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">StockDan</h1>
            <p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:.02em;text-transform:uppercase;">Gestão de Insumos Agrícolas</p>
          </td>
        </tr>

        <!-- ══ SUBHEADER ══ -->
        <tr>
          <td style="background:${C.greenDark};padding:14px 32px;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.9);font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              📅 Relatório de <strong>${data.period}</strong> · Gerado em ${data.generatedAt}
            </p>
          </td>
        </tr>

        <!-- ══ BODY ══ -->
        <tr>
          <td style="background:${C.bodyBg};padding:32px 32px 8px;">

            <!-- Saudação -->
            <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:${C.heading};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Olá, ${data.gestorName}! 👋
            </h2>
            <p style="margin:0 0 28px;font-size:14px;color:${C.text};line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Aqui está o resumo automático do seu estoque de insumos agrícolas.
            </p>

            <!-- Cards de resumo -->
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
              <tr>
                <td width="33%" style="padding-right:8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.slate50};border:1px solid ${C.border};border-radius:10px;padding:16px;text-align:center;">
                    <tr><td style="font-size:26px;font-weight:800;color:${C.heading};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${data.farms.length}</td></tr>
                    <tr><td style="font-size:11px;color:${C.subtle};text-transform:uppercase;letter-spacing:.05em;padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Fazenda${data.farms.length !== 1 ? 's' : ''}</td></tr>
                  </table>
                </td>
                <td width="33%" style="padding:0 4px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.slate50};border:1px solid ${C.border};border-radius:10px;padding:16px;text-align:center;">
                    <tr><td style="font-size:26px;font-weight:800;color:${C.heading};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${data.totalTx}</td></tr>
                    <tr><td style="font-size:11px;color:${C.subtle};text-transform:uppercase;letter-spacing:.05em;padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Aplicações</td></tr>
                  </table>
                </td>
                <td width="33%" style="padding-left:8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:${data.totalAlerts > 0 ? C.redLight : C.greenLight};border:1px solid ${data.totalAlerts > 0 ? '#fecaca' : '#bbf7d0'};border-radius:10px;padding:16px;text-align:center;">
                    <tr><td style="font-size:26px;font-weight:800;color:${data.totalAlerts > 0 ? C.red : C.greenDark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${data.totalAlerts}</td></tr>
                    <tr><td style="font-size:11px;color:${data.totalAlerts > 0 ? '#b91c1c' : C.greenDark};text-transform:uppercase;letter-spacing:.05em;padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Alert${data.totalAlerts !== 1 ? 'as' : 'a'}</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Divisor -->
            <hr style="border:none;border-top:1px solid ${C.border};margin:0 0 28px;">

            <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:${C.heading};text-transform:uppercase;letter-spacing:.05em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              📦 Estoque por Fazenda
            </h3>

          </td>
        </tr>

        <!-- Alertas (se houver) -->
        ${alertsNote}

        <!-- Fazendas -->
        <tr>
          <td style="background:${C.bodyBg};padding:0 0 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${farmsHtml}
            </table>
          </td>
        </tr>

        <!-- ══ FOOTER ══ -->
        <tr>
          <td style="background:${C.slate50};border:1px solid ${C.border};border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:12px;color:${C.subtle};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Este relatório foi gerado automaticamente pelo <strong style="color:${C.green};">StockDan</strong>.
            </p>
            <p style="margin:0;font-size:11px;color:#cbd5e1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Para alterar ou desativar os relatórios, acesse <strong>Relatórios</strong> no menu lateral do sistema.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  return { subject, html }
}
