// lib/fcm.ts
//
// Firebase Admin SDK singleton para envio de push notifications via FCM.
// Fire-and-forget: erros são logados mas nunca lançados — falha de push
// não deve falhar a operação principal (mesma filosofia de logAudit).
//
// Limpeza automática: tokens inválidos são removidos do Supabase para
// evitar acumular tokens mortos.

import admin from 'firebase-admin'
import { createServerClient } from './supabase'

// Códigos FCM que indicam token definitivamente inválido/expirado
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

function getFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!

  // Guard explícito: erro claro se env vars ausentes (capturado pelo try/catch)
  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      '[fcm] Variáveis FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY são obrigatórias.'
    )
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  })
}

/**
 * Envia push notification para uma lista de FCM tokens.
 * Fire-and-forget — nunca lança exceção.
 * Remove automaticamente tokens inválidos do banco.
 */
export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string
): Promise<void> {
  if (!tokens.length) return

  try {
    const app       = getFirebaseApp()
    const messaging = admin.messaging(app)

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: {
        notification: {
          color: '#22c55e',
          // Sem clickAction — o Capacitor/Android abre o app via IntentFilter padrão
        },
        priority: 'high',
      },
    })

    console.log(`[fcm] Enviados: ${response.successCount} ok, ${response.failureCount} falha(s).`)

    // Remove tokens que o FCM reportou como definitivamente inválidos
    const invalidTokens: string[] = []
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code && INVALID_TOKEN_CODES.has(r.error.code)) {
        invalidTokens.push(tokens[i])
      }
    })

    if (invalidTokens.length > 0) {
      const supabase = createServerClient()
      const { error: deleteError } = await supabase
        .from('push_tokens')
        .delete()
        .in('fcm_token', invalidTokens)
      if (deleteError) {
        console.error('[fcm] Erro ao remover tokens inválidos:', deleteError.message)
      } else {
        console.log(`[fcm] Removidos ${invalidTokens.length} token(s) inválido(s).`)
      }
    }
  } catch (e) {
    console.error('[fcm] sendPushNotification error:', e)
  }
}
