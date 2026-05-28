import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase'
import type { Role } from './permissions'

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
  role: Role
  gestor_id: string
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

// ── Cache em memória (TTL 30s) ───────────────────────────────────────────────
// Evita DB round-trip em toda request. Trade-off: usuário rebaixado pode ter até
// 30s de janela com privilégios antigos. Aceitável para o caso de uso (mudanças
// de cargo são raras e propagadas em segundos, não em horas).
const TV_CACHE = new Map<string, { tv: number; role: string; gestor_id: string | null; expiresAt: number }>()
const TV_CACHE_TTL = 30_000

interface DBUserSnapshot {
  tv: number
  role: string
  gestor_id: string | null
}

async function getUserSnapshot(userId: string): Promise<DBUserSnapshot | null> {
  const cached = TV_CACHE.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return { tv: cached.tv, role: cached.role, gestor_id: cached.gestor_id }
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('users')
    .select('token_version, role, gestor_id')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  const snapshot: DBUserSnapshot = {
    tv: data.token_version ?? 0,
    role: data.role,
    gestor_id: data.gestor_id ?? null,
  }
  TV_CACHE.set(userId, { ...snapshot, expiresAt: Date.now() + TV_CACHE_TTL })
  return snapshot
}

/** Invalida cache imediatamente (chamado quando token_version é incrementado). */
export function invalidateTokenVersionCache(userId: string) {
  TV_CACHE.delete(userId)
}

/**
 * Verificação completa: assinatura + token_version + role contra DB.
 *
 * Valida também que role e gestor_id no token batem com o banco — detecta
 * tokens emitidos antes de mudanças de cargo feitas diretamente via SQL
 * (sem incrementar token_version, ex: migration RH-1 admin→gestor).
 */
async function verifyTokenStrict(token: string): Promise<SessionUser | null> {
  const payload = await verifyToken(token)
  if (!payload) return null

  const snapshot = await getUserSnapshot(payload.id)
  if (!snapshot) return null // usuário deletado

  const tokenTv = payload.tv ?? 0
  if (tokenTv < snapshot.tv) return null // token revogado

  // Se o role ou gestor_id divergem do banco, o token está stale.
  // Retorna null para forçar re-login e emitir token com dados corretos.
  if (payload.role !== snapshot.role) return null
  if ((payload.gestor_id ?? null) !== snapshot.gestor_id) return null

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
