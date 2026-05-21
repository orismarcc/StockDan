const QUEUE_KEY = 'stockdan_queue'

export interface QueueItem {
  id: string
  farm_id: string
  insumo_id: string
  talhao_id: string
  quantity: number
  date: string
  notes: string | null
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
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

export const offlineQueue = {
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

  incrementRetry(id: string) {
    write(read().map((i) => (i.id === id ? { ...i, retries: i.retries + 1 } : i)))
  },

  count(): number {
    return read().length
  },
}
