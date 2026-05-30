// lib/fcm.ts
//
// Firebase Admin SDK singleton para envio de push notifications via FCM.
// Fire-and-forget: erros são logados mas nunca lançados — falha de push
// não deve falhar a operação principal (mesma filosofia de logAudit).
//
// Limpeza automática: tokens inválidos (registration-token-not-registered)
// são removidos do Supabase para evitar acumular tokens mortos.

import admin from 'firebase-admin'
import { createServerClient } from './supabase'

function getFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel armazena \n como literal — precisa converter de volta
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
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
          color:       '#22c55e',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
        priority: 'high',
      },
    })

    // Remove tokens que o FCM reportou como inválidos
    const invalidTokens: string[] = []
    response.responses.forEach((r, i) => {
      if (
        !r.success &&
        r.error?.code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(tokens[i])
      }
    })

    if (invalidTokens.length > 0) {
      const supabase = createServerClient()
      await supabase
        .from('push_tokens')
        .delete()
        .in('fcm_token', invalidTokens)
      console.log(`[fcm] Removidos ${invalidTokens.length} token(s) inválido(s).`)
    }
  } catch (e) {
    console.error('[fcm] sendPushNotification error:', e)
  }
}
