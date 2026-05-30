// lib/notifications.ts
//
// Helpers de domínio para push notifications.
// Busca tokens FCM de gestores e admins do tenant e envia via FCM.
// Todos os exports são fire-and-forget (catch interno, nunca lança).

import { createServerClient } from './supabase'
import { sendPushNotification } from './fcm'

/**
 * Busca todos os FCM tokens de usuários com cargo gestor ou admin
 * do tenant identificado por gestorId. (P8: isolamento de tenant)
 */
async function getGestorAdminTokens(gestorId: string): Promise<string[]> {
  const supabase = createServerClient()

  // Busca IDs de gestor + admins no tenant
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('gestor_id', gestorId)
    .in('role', ['gestor', 'admin'])

  if (!users?.length) return []

  const userIds = users.map((u) => u.id)

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('fcm_token')
    .in('user_id', userIds)

  return (tokens ?? []).map((t) => t.fcm_token)
}

/**
 * Envia notificação para todos os gestores e admins de um tenant.
 * Fire-and-forget — nunca lança exceção.
 */
export async function notifyTenant(
  gestorId: string,
  title: string,
  body: string
): Promise<void> {
  try {
    const tokens = await getGestorAdminTokens(gestorId)
    if (!tokens.length) return
    await sendPushNotification(tokens, title, body)
  } catch (e) {
    console.error('[notifications] notifyTenant error:', e)
  }
}

/**
 * Notificação de nova aplicação (saída de estoque).
 * Exemplo: "João Silva aplicou 50 kg de MAP no Talhão 01"
 */
export async function notifyNovaAplicacao(params: {
  gestorId:    string
  userName:    string
  insumoTitle: string
  talhaoName:  string
  quantity:    number
  unit:        string
}): Promise<void> {
  const qty  = params.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const body = `${params.userName} aplicou ${qty} ${params.unit} de ${params.insumoTitle} no ${params.talhaoName}`
  await notifyTenant(params.gestorId, 'Nova Aplicação Registrada', body)
}

/**
 * Notificação de estoque abaixo do mínimo.
 * Exemplo: "MAP em Sítio Portuga: 3.000 kg (mín: 5.000 kg)"
 */
export async function notifyEstoqueCritico(params: {
  gestorId:    string
  farmName:    string
  insumoTitle: string
  currentQty:  number
  minQty:      number
  unit:        string
}): Promise<void> {
  const current = params.currentQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const min     = params.minQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  const body    = `${params.insumoTitle} em ${params.farmName}: ${current} ${params.unit} (mín: ${min} ${params.unit})`
  await notifyTenant(params.gestorId, '⚠️ Estoque Crítico', body)
}
