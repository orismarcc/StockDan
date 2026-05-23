const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
