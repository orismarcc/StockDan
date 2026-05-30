import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import fs from 'fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const get = (k) => raw.match(new RegExp(k + '=(.+)'))?.[1]?.trim()

const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))
const resend   = new Resend(get('RESEND_API_KEY'))

function badge(qty, min) {
  if (qty <= 0) return `<span style="padding:2px 8px;border-radius:999px;background:#fef2f2;color:#ef4444;font-size:11px;font-weight:600;display:inline-block">Zerado</span>`
  if (min != null && qty <= min) return `<span style="padding:2px 8px;border-radius:999px;background:#fff7ed;color:#f97316;font-size:11px;font-weight:600;display:inline-block">Crítico</span>`
  return `<span style="padding:2px 8px;border-radius:999px;background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;display:inline-block">OK</span>`
}

function fmt(n) { return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }

const CUBE = `<svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
  <rect width="52" height="52" rx="14" fill="rgba(255,255,255,0.18)"/>
  <polygon points="26,10 40,17 26,24 12,17" fill="rgba(255,255,255,0.97)"/>
  <polygon points="40,17 40,35 26,42 26,24" fill="rgba(255,255,255,0.75)"/>
  <polygon points="12,17 12,35 26,42 26,24" fill="rgba(255,255,255,0.55)"/>
</svg>`

function buildHtml(data) {
  const farmsHtml = data.farms.map(farm => {
    const rows = farm.insumos.map((ins, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0">${ins.title}</td>
        <td style="padding:10px 14px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(ins.quantity)} ${ins.unit}</td>
        <td style="padding:10px 14px;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;text-align:right">${ins.min_quantity != null ? fmt(ins.min_quantity) + ' ' + ins.unit : '—'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center">${badge(ins.quantity, ins.min_quantity)}</td>
      </tr>`).join('')

    return `
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <tr style="background:#f8fafc"><td style="padding:16px 18px">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="font-size:15px;font-weight:700;color:#0f172a">${farm.name}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px">${farm.farmer_name} · ${farm.city}, ${farm.state}</div>
            </td>
            <td style="text-align:right;white-space:nowrap">
              <div style="font-size:12px;color:#475569">${farm.txCount} aplicaç${farm.txCount === 1 ? 'ão' : 'ões'}</div>
              <div style="font-size:12px;color:#22c55e;font-weight:600">${fmt(farm.totalKg)} kg retirados</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr style="background:#f8fafc">
              <th style="padding:8px 14px;font-size:11px;color:#94a3b8;text-align:left;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.05em">Insumo</th>
              <th style="padding:8px 14px;font-size:11px;color:#94a3b8;text-align:right;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.05em">Estoque atual</th>
              <th style="padding:8px 14px;font-size:11px;color:#94a3b8;text-align:right;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.05em">Mínimo</th>
              <th style="padding:8px 14px;font-size:11px;color:#94a3b8;text-align:center;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.05em">Status</th>
            </tr>
            ${rows || `<tr><td colspan="4" style="padding:16px;text-align:center;font-size:13px;color:#94a3b8">Nenhum insumo cadastrado.</td></tr>`}
          </table>
        </td></tr>
      </table>
    </td></tr>`
  }).join('')

  const alertBanner = data.totalAlerts > 0 ? `
    <tr><td style="padding:0 32px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px">
        <tr><td style="font-size:13px;color:#ef4444;font-weight:600">⚠️ ${data.totalAlerts} insumo${data.totalAlerts > 1 ? 's' : ''} abaixo do estoque mínimo</td></tr>
        <tr><td style="font-size:12px;color:#b91c1c;padding-top:4px">Verifique os itens marcados como <strong>Crítico</strong> ou <strong>Zerado</strong> abaixo.</td></tr>
      </table>
    </td></tr>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- HEADER -->
  <tr><td style="background:#22c55e;border-radius:16px 16px 0 0;padding:36px 32px;text-align:center">
    ${CUBE}
    <h1 style="margin:16px 0 4px;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px">StockDan</h1>
    <p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:.02em;text-transform:uppercase">Gestão de Insumos Agrícolas</p>
  </td></tr>

  <!-- SUB-HEADER -->
  <tr><td style="background:#16a34a;padding:14px 32px;text-align:center">
    <p style="margin:0;color:rgba(255,255,255,0.9);font-size:13px">
      📅 Relatório de <strong>${data.period}</strong> · Gerado em ${data.generatedAt}
    </p>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#ffffff;padding:32px 32px 8px">
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0f172a">Olá, ${data.gestorName}! 👋</h2>
    <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6">Aqui está o resumo automático do seu estoque de insumos agrícolas.</p>

    <!-- SUMMARY CARDS -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr>
        <td width="33%" style="padding-right:8px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
            <tr><td style="font-size:28px;font-weight:800;color:#0f172a">${data.farms.length}</td></tr>
            <tr><td style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;padding-top:4px">Fazenda${data.farms.length !== 1 ? 's' : ''}</td></tr>
          </table>
        </td>
        <td width="33%" style="padding:0 4px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
            <tr><td style="font-size:28px;font-weight:800;color:#0f172a">${data.totalTx}</td></tr>
            <tr><td style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;padding-top:4px">Aplicações</td></tr>
          </table>
        </td>
        <td width="33%" style="padding-left:8px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${data.totalAlerts > 0 ? '#fef2f2' : '#dcfce7'};border:1px solid ${data.totalAlerts > 0 ? '#fecaca' : '#bbf7d0'};border-radius:10px;padding:16px;text-align:center">
            <tr><td style="font-size:28px;font-weight:800;color:${data.totalAlerts > 0 ? '#ef4444' : '#16a34a'}">${data.totalAlerts}</td></tr>
            <tr><td style="font-size:11px;color:${data.totalAlerts > 0 ? '#b91c1c' : '#15803d'};text-transform:uppercase;letter-spacing:.05em;padding-top:4px">Alert${data.totalAlerts !== 1 ? 'as' : 'a'}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 28px">
    <h3 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.05em">📦 Estoque por Fazenda</h3>
  </td></tr>

  ${alertBanner}

  <tr><td style="background:#ffffff;padding:0 0 8px">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${farmsHtml}
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center">
    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8">
      Este relatório foi gerado automaticamente pelo <strong style="color:#22c55e">StockDan</strong>.
    </p>
    <p style="margin:0;font-size:11px;color:#cbd5e1">
      Para alterar ou desativar os relatórios, acesse <strong>Relatórios</strong> no menu lateral do sistema.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// Coleta dados
const { data: gestor } = await supabase.from('users').select('id,name,email').eq('email', 'orismar.bm@gmail.com').maybeSingle()
const { data: farms }  = await supabase.from('farms').select('id,name,city,state,farmer_name').eq('owner_id', gestor.id).order('name')
const farmIds = (farms ?? []).map(f => f.id)
const { data: insumos } = await supabase.from('insumos').select('id,farm_id,title,unit,quantity,min_quantity').in('farm_id', farmIds.length ? farmIds : ['x'])
const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const { data: txs } = await supabase.from('transactions').select('id,farm_id,quantity,type').in('farm_id', farmIds.length ? farmIds : ['x']).gte('date', since)

const iByF = {}, tByF = {}
for (const i of insumos ?? []) { if (!iByF[i.farm_id]) iByF[i.farm_id] = []; iByF[i.farm_id].push(i) }
for (const t of txs ?? []) {
  if (!tByF[t.farm_id]) tByF[t.farm_id] = { count: 0, totalKg: 0 }
  tByF[t.farm_id].count++
  if (t.type === 'saida') tByF[t.farm_id].totalKg += Number(t.quantity)
}

const farmsData = (farms ?? []).map(f => ({
  id: f.id, name: f.name, city: f.city, state: f.state, farmer_name: f.farmer_name,
  insumos: (iByF[f.id] ?? []).map(i => ({
    title: i.title, unit: i.unit,
    quantity: Number(i.quantity),
    min_quantity: i.min_quantity != null ? Number(i.min_quantity) : null
  })),
  txCount: tByF[f.id]?.count ?? 0,
  totalKg: tByF[f.id]?.totalKg ?? 0
}))

const totalAlerts = farmsData.reduce((a, f) =>
  a + f.insumos.filter(i => i.quantity <= 0 || (i.min_quantity != null && i.quantity <= i.min_quantity)).length, 0)
const totalTx = Object.values(tByF).reduce((a, b) => a + b.count, 0)
const generatedAt = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

console.log(`Dados coletados: ${farms?.length} fazenda(s), ${insumos?.length} insumo(s), ${txs?.length} transação(ões), ${totalAlerts} alerta(s)`)

const html    = buildHtml({ gestorName: gestor.name, period: 'últimos 30 dias', generatedAt, farms: farmsData, totalAlerts, totalTx })
const subject = `📊 Relatório StockDan — últimos 30 dias | ${generatedAt}`

// Envia para devastuss@gmail.com (owner da conta Resend — único email permitido sem domínio)
const { data: sent, error } = await resend.emails.send({
  from:    'StockDan <onboarding@resend.dev>',
  to:      'devastuss@gmail.com',
  subject,
  html,
})

if (error) {
  console.error('❌ Erro Resend:', error.message)
} else {
  console.log('✅ Email enviado com sucesso!')
  console.log('   ID:', sent.id)
  console.log('   Para: devastuss@gmail.com')
  console.log('   Assunto:', subject)
}
