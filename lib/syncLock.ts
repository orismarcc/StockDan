const LOCK_KEY = 'stockdan_sync_lock'
const LOCK_TTL = 30_000 // 30s — proteção contra lock eterno (crash de aba)

export const syncLock = {
  acquire(): boolean {
    try {
      const existing = localStorage.getItem(LOCK_KEY)
      if (existing) {
        const ts = Number(existing)
        if (Date.now() - ts < LOCK_TTL) return false // lock ativo em outra aba
      }
      localStorage.setItem(LOCK_KEY, String(Date.now()))
      return true
    } catch {
      return false
    }
  },

  release() {
    try {
      localStorage.removeItem(LOCK_KEY)
    } catch {}
  },
}
