const QUEUE_KEY = 'stockdan_queue'

export interface QueueItem {
  id: string
  farm_id: string
  insumo_id: string
  talhao_id: string
  quantity: number
  date: string
  notes: string | null
  area_ha: number | null
  created_at: string
  retries: number
}

function read(): QueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function write(items: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('STORAGE_FULL')
    }
    throw e
  }
}

const MAX_RETRIES = 5

export const offlineQueue = {
  MAX_RETRIES,

  getAll: read,

  add(item: Omit<QueueItem, 'id' | 'created_at' | 'retries'>): QueueItem {
    const full: QueueItem = {
      ...item,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      retries: 0,
    }
    write([...read(), full])
    return full
  },

  remove(id: string) {
    write(read().filter((i) => i.id !== id))
  },

  // Returns true if the item was removed because it exceeded MAX_RETRIES
  incrementRetry(id: string): boolean {
    const items = read()
    const updated = items.map((i) => (i.id === id ? { ...i, retries: i.retries + 1 } : i))
    const item = updated.find((i) => i.id === id)
    if (item && item.retries >= MAX_RETRIES) {
      write(items.filter((i) => i.id !== id))
      return true
    }
    write(updated)
    return false
  },

  count(): number {
    return read().length
  },
}
