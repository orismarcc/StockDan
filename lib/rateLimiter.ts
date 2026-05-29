// lib/rateLimiter.ts
//
// Rate limiter para tentativas de login — armazenamento compartilhado via Upstash Redis.
// Garante que o limite seja global entre todas as instâncias Lambda do Vercel.
//
// Semântica: apenas falhas contam (login bem-sucedido reseta o contador).
// Falha de Redis → fail open (não bloqueia usuário legítimo).

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const MAX_ATTEMPTS = 5
const WINDOW_SEC   = 15 * 60 // 15 minutos

function key(ip: string): string {
  return `rl:login:${ip}`
}

/**
 * Verifica se o IP está bloqueado.
 * Fail open: se Redis estiver indisponível, retorna { allowed: true }.
 */
export async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; retryAfterSecs?: number }> {
  try {
    const count = (await redis.get<number>(key(ip))) ?? 0
    if (count >= MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key(ip))
      return { allowed: false, retryAfterSecs: ttl > 0 ? ttl : 1 }
    }
    return { allowed: true }
  } catch (e) {
    console.error('[rateLimiter] Redis error (fail open):', e)
    return { allowed: true }
  }
}

/**
 * Registra uma tentativa de login com falha.
 * INCR é atômico — seguro para múltiplas instâncias simultâneas.
 */
export async function recordFailure(ip: string): Promise<void> {
  try {
    const k = key(ip)
    const count = await redis.incr(k)
    if (count === 1) {
      // Primeira falha — define janela de expiração
      await redis.expire(k, WINDOW_SEC)
    }
  } catch (e) {
    console.error('[rateLimiter] Redis error on recordFailure:', e)
  }
}

/**
 * Reseta contador após login bem-sucedido.
 */
export async function resetAttempts(ip: string): Promise<void> {
  try {
    await redis.del(key(ip))
  } catch (e) {
    console.error('[rateLimiter] Redis error on resetAttempts:', e)
  }
}
