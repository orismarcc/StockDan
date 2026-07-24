// lib/numeric.ts
//
// Parsing e arredondamento robusto de valores decimais.
//
// PROBLEMA que motivou: inputs `type="number" step="0.01"` sofrem
// "step-snapping" em WebView Android e navegadores com locale pt-BR
// (vírgula decimal) — o usuário digita 3 e o widget grava 2,99.
//
// SOLUÇÃO: inputs decimais usam `type="text" inputMode="decimal"` (sem
// snapping) e todo valor passa por `parseDecimal` + `roundTo`, que
// aceita "3", "3,5", "3.5", "1.234,56" e corrige artefatos de float.

/**
 * Arredonda para N casas decimais corrigindo artefatos de ponto flutuante.
 * roundTo(2.9999999, 2) === 3   |   roundTo(1.005, 2) === 1.01
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** decimals
  // Number.EPSILON corrige casos como 1.005 * 100 = 100.49999999999999
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor
}

/**
 * Converte texto do usuário em número, aceitando formatos pt-BR e en-US.
 *
 * Aceita: "3", "3,5", "3.5", "1.234,56", "1,234.56", " 42 "
 * Retorna null se não for um número válido.
 *
 * @param raw     Texto (ou número) a converter
 * @param decimals Se informado, arredonda o resultado com roundTo
 */
export function parseDecimal(raw: unknown, decimals?: number): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return decimals != null ? roundTo(raw, decimals) : raw
  }
  if (typeof raw !== 'string') return null

  let s = raw.trim()
  if (!s) return null

  const hasComma = s.includes(',')
  const hasDot   = s.includes('.')

  if (hasComma && hasDot) {
    // Ambos presentes: o último separador é o decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // pt-BR: "1.234,56" → ponto é milhar, vírgula é decimal
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // en-US: "1,234.56" → vírgula é milhar
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Só vírgula → separador decimal
    s = s.replace(',', '.')
  }

  // Remove qualquer caractere que não seja dígito, ponto ou sinal
  s = s.replace(/[^0-9.\-]/g, '')
  if (s === '' || s === '-' || s === '.') return null

  const n = Number(s)
  if (!Number.isFinite(n)) return null

  return decimals != null ? roundTo(n, decimals) : n
}

/**
 * Converte texto do usuário em inteiro. Aceita "32", " 32 ".
 * Retorna null se inválido.
 */
export function parseIntStrict(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : Math.round(raw)
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/[^0-9\-]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

// Precisão padrão por tipo de dado do domínio
export const DECIMALS_AREA     = 2  // hectares
export const DECIMALS_QUANTITY = 3  // kg / L
export const DECIMALS_RATE     = 2  // kg/ha, CV%
