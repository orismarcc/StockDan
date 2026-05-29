// lib/withAuth.ts
//
// HOF que envolve route handlers de API garantindo autenticação antes de
// executar o handler. Elimina o boilerplate repetido de getActiveSession()
// e torna impossível esquecer o check em novas rotas.
//
// Padrão P-C3: todo route handler novo DEVE usar withAuth em vez de chamar
// getActiveSession() manualmente.
//
// ── Uso sem params ────────────────────────────────────────────────────────
//   export const GET = withAuth(async (req, session) => {
//     return NextResponse.json({ ok: true })
//   })
//
// ── Uso com params ────────────────────────────────────────────────────────
//   export const GET = withAuth<{ id: string }>(async (req, session, params) => {
//     const { id } = await params!
//     return NextResponse.json({ id })
//   })
//
// ── Verificação de capability ─────────────────────────────────────────────
//   export const DELETE = withAuth(async (req, session) => {
//     if (!can(session.role, 'farm.delete')) {
//       return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
//     }
//     // ...
//   })

import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from './auth'
import type { SessionUser } from './auth'

type AuthedHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  session: SessionUser,
  params: Promise<P> | undefined
) => Promise<Response>

/**
 * Envolve um route handler garantindo sessão ativa.
 * Retorna 401 automaticamente se não autenticado.
 */
export function withAuth<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedHandler<P>
) {
  return async (
    req: NextRequest,
    ctx?: { params?: Promise<P> }
  ): Promise<Response> => {
    const session = await getActiveSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    return handler(req, session, ctx?.params)
  }
}
