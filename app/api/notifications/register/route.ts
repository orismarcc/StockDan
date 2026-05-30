// app/api/notifications/register/route.ts
//
// Registra ou atualiza o FCM token do usuário autenticado.
// Upsert por fcm_token (UNIQUE) — garante que reinstalar o app
// não cria duplicatas, apenas atualiza o vínculo user_id.
//
// P10: usa withAuth — handler nunca roda sem sessão.
// P8: gestor_id vem da sessão — nunca do body.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseBody } from '@/lib/utils'
import { withAuth } from '@/lib/withAuth'

export const POST = withAuth(async (req, session) => {
  const body = await parseBody<{ fcm_token?: string; platform?: string }>(req)
  if (!body?.fcm_token) {
    return NextResponse.json({ error: 'fcm_token é obrigatório.' }, { status: 400 })
  }

  const { fcm_token, platform = 'android' } = body

  if (typeof fcm_token !== 'string' || fcm_token.length < 10) {
    return NextResponse.json({ error: 'fcm_token inválido.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id:   session.id,
        gestor_id: session.gestor_id,
        fcm_token,
        platform,
      },
      { onConflict: 'fcm_token' }
    )

  if (error) {
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})
