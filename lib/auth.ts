import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase'

const COOKIE = 'stockdan_session'

function cleanEnv(s: string): string {
  return s.replace(/^﻿/, '').trim()
}

function secret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado.')
  return new TextEncoder().encode(cleanEnv(s))
}

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'operario'
  mustChangePassword: boolean
  /** Versão do token. Incrementada no DB quando a sessão precisa ser invalidada
   *  (mudança de cargo). verifyToken rejeita JWTs com tv menor que o do DB. */
  tv?: number
}

export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

/**
 * Verificação rápida (apenas assinatura). NÃO valida token_version contra DB.
 * Use somente em casos que não precisam de validação estrita (raríssimo).
 */
export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

// ── Cache em memória do token_version (TTL 30s) ──────────────────────────────
// Evita DB round-trip em toda request. Trade-off: usuário rebaixado pode ter até
// 30s de janela com privilégios antigos. Aceitável para o caso de uso (mudanças
// de cargo são raras e propagadas em segundos, não em horas).
const TV_CACHE = new Map<string, { tv: number; expiresAt: number }>()
const TV_CACHE_TTL = 30_000

async function getCurrentTokenVersion(userId: string): Promise<number | null> {
  const cached = TV_CACHE.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.tv

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('users')
    .select('token_version')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  const tv = data.token_version ?? 0
  TV_CACHE.set(userId, { tv, expiresAt: Date.now() + TV_CACHE_TTL })
  return tv
}

/** Invalida cache imediatamente (chamado quando token_version é incrementado). */
export function invalidateTokenVersionCache(userId: string) {
  TV_CACHE.delete(userId)
}

/**
 * Verificação completa: assinatura + token_version contra DB.
 * Use esta sempre que o resultado for confiar em `role` para autorização.
 */
async function verifyTokenStrict(token: string): Promise<SessionUser | null> {
  const payload = await verifyToken(token)
  if (!payload) return null

  const currentTv = await getCurrentTokenVersion(payload.id)
  if (currentTv === null) return null // usuário deletado

  const tokenTv = payload.tv ?? 0
  if (tokenTv < currentTv) return null // token revogado por mudança de role

  return payload
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null
  return verifyTokenStrict(token)
}

/**
 * Like getSession(), but also returns null if the user has a pending
 * password change (mustChangePassword = true).
 * Use this in ALL API routes that require a fully-active session.
 * The only routes that should still use getSession() are:
 *   - /api/auth/login (no session yet)
 *   - /api/auth/logout (any session can logout)
 *   - /api/auth/change-password (needs mustChangePassword session to work)
 */
export async function getActiveSession(): Promise<SessionUser | null> {
  const session = await getSession()
  if (!session || session.mustChangePassword) return null
  return session
}

export { COOKIE }
