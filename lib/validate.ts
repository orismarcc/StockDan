const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Shared constants (centralize to avoid magic numbers across routes/components) ──

/** Maximum quantity/area value accepted in any numeric field (kg or ha). */
export const MAX_QUANTITY = 9_999_999

/** Maximum length of free-text notes fields. */
export const MAX_NOTES = 1_000

/** Maximum length of a user's display name. */
export const MAX_NAME_LENGTH = 120

/** Maximum length of an email address (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254

// Returns trimmed string or null if blank/missing
export function trimField(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const t = val.trim()
  return t.length > 0 ? t : null
}

// Validates YYYY-MM-DD format and sane year range (2000–2099)
export function isValidDate(val: unknown): val is string {
  if (typeof val !== 'string') return false
  if (!DATE_RE.test(val)) return false
  const year = Number(val.slice(0, 4))
  return year >= 2000 && year <= 2099
}

// Validates quantity: finite positive number, ≤ 9,999,999
export function isValidQuantity(val: unknown): val is number {
  const n = Number(val)
  return Number.isFinite(n) && n > 0 && n <= 9_999_999
}

// Validates area in hectares: positive, ≤ 9,999,999
export function isValidAreaHa(val: unknown): val is number {
  const n = Number(val)
  return Number.isFinite(n) && n > 0 && n <= 9_999_999
}

// Validates a UUID v4 format (used for offline_id)
export function isUUID(val: unknown): val is string {
  return typeof val === 'string' && UUID_RE.test(val)
}

// Checks string is within max byte length (guards DB column limits)
export function withinLength(val: string, max: number): boolean {
  return val.length <= max
}

/**
 * Validates and sanitises a client-supplied ISO 8601 timestamp for offline records.
 * Accepts: valid ISO string, within the last 7 days up to +1 minute (clock-skew tolerance).
 * Returns null if invalid — callers should fall back to NOW() server-side.
 *
 * Centralised here to avoid the duplicate implementations that previously existed in
 * `transactions/route.ts` and `insumos/[iid]/stock/route.ts`.
 */
export function parseClientTimestamp(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null
  const ts = new Date(raw)
  if (isNaN(ts.getTime())) return null
  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const oneMinuteMs = 60 * 1000
  if (ts.getTime() < now - sevenDaysMs) return null  // too old
  if (ts.getTime() > now + oneMinuteMs) return null   // future (clock skew tolerated up to 1 min)
  return ts.toISOString()
}
