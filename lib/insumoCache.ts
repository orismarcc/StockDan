const CACHE_KEY = 'stockdan_insumo_cache'
const CACHE_TTL_MS = 4 * 60 * 60 * 1000 // 4 horas

export interface CachedInsumo {
  id: string
  title: string
  unit: string
  quantity: number
}

interface FarmCache {
  insumos: CachedInsumo[]
  lastUpdated: string
}

function read(): Record<string, FarmCache> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function write(data: Record<string, FarmCache>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('STORAGE_FULL')
    }
    throw e
  }
}

export const insumoCache = {
  setFarm(farmId: string, insumos: CachedInsumo[]) {
    const all = read()
    all[farmId] = { insumos, lastUpdated: new Date().toISOString() }
    write(all)
  },

  getFarm(farmId: string): CachedInsumo[] {
    const entry = read()[farmId]
    if (!entry) return []
    const age = Date.now() - new Date(entry.lastUpdated).getTime()
    if (age > CACHE_TTL_MS) return [] // expirado — forçar busca no servidor
    return entry.insumos
  },

  isStale(farmId: string): boolean {
    const entry = read()[farmId]
    if (!entry) return true
    return Date.now() - new Date(entry.lastUpdated).getTime() > CACHE_TTL_MS
  },

  decreaseQuantity(farmId: string, insumoId: string, amount: number) {
    const all = read()
    const farm = all[farmId]
    if (!farm) return
    farm.insumos = farm.insumos.map((i) =>
      i.id === insumoId ? { ...i, quantity: Math.max(0, i.quantity - amount) } : i
    )
    write(all)
  },
}
