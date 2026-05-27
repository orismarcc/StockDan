/**
 * Cache de regulagens de implemento por talhao.
 *
 * Mesmo pattern de insumoCache: localStorage, TTL 4h, isStale flag.
 * Usado por TalhaoTabs para exibir regulagens cached quando offline.
 */

const CACHE_KEY = 'stockdan_regulagem_cache'
const CACHE_TTL_MS = 4 * 60 * 60 * 1000  // 4h

export interface CachedAdjustment {
  id: string
  created_at: string
  implemento: string | null
  taxa_kgha: number | null
  palhetas: string | null
  rpm_maquina: number | null
  rpm_pratos_eixo: number | null
  num_bandejas: number | null
  espacamento_bandejas: string | null
  cv_percent: number | null
  faixa_aplicacao: string | null
  comporta: string | null
  users: { name: string } | null
}

interface TalhaoCache {
  adjustments: CachedAdjustment[]
  lastUpdated: string
}

function read(): Record<string, TalhaoCache> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function write(data: Record<string, TalhaoCache>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('STORAGE_FULL')
    }
    throw e
  }
}

export const regulagemCache = {
  setTalhao(talhaoId: string, adjustments: CachedAdjustment[]) {
    const all = read()
    all[talhaoId] = { adjustments, lastUpdated: new Date().toISOString() }
    write(all)
  },

  getTalhao(talhaoId: string): CachedAdjustment[] | null {
    const entry = read()[talhaoId]
    if (!entry) return null
    // Retorna mesmo stale — UI decide se mostra warning
    return entry.adjustments
  },

  isStale(talhaoId: string): boolean {
    const entry = read()[talhaoId]
    if (!entry) return true
    return Date.now() - new Date(entry.lastUpdated).getTime() > CACHE_TTL_MS
  },
}
