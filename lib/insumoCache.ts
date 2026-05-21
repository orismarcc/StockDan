const CACHE_KEY = 'stockdan_insumo_cache'

export interface CachedInsumo {
  id: string
  title: string
  unit: 'kg' | 'bag'
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
  localStorage.setItem(CACHE_KEY, JSON.stringify(data))
}

export const insumoCache = {
  setFarm(farmId: string, insumos: CachedInsumo[]) {
    const all = read()
    all[farmId] = { insumos, lastUpdated: new Date().toISOString() }
    write(all)
  },

  getFarm(farmId: string): CachedInsumo[] {
    return read()[farmId]?.insumos ?? []
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
