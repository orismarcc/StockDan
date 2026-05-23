import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

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
}

export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
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
