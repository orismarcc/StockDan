// Nota: este limitador usa memória de processo (in-process Map).
// Em ambientes serverless (Vercel) com múltiplas instâncias simultâneas, cada instância
// mantém seu próprio contador independente — o limite é por instância, não global.
// Para produção de alta escala, substituir por Redis/Upstash com contador compartilhado.
const attempts = new Map<string, { count: number; resetAt: number }>()

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSecs?: number } {
  const now = Date.now()
  const entry = attempts.get(ip)

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) }
    }
  }

  return { allowed: true }
}

export function recordFailure(ip: string): void {
  const now = Date.now()
  const entry = attempts.get(ip)

  if (!entry || now >= entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    entry.count++
  }
}

export function resetAttempts(ip: string): void {
  attempts.delete(ip)
}
