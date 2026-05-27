'use client'

import { useEffect, useState, useRef } from 'react'

/**
 * useFormDraft — auto-save de form em localStorage com debounce.
 *
 * Restaura o draft ao montar (se existir). Salva a cada change com debounce
 * de 500ms. `clear()` remove o draft (chamar pos-submit bem-sucedido).
 *
 * @param key  Identificador unico do draft (ex: `withdrawal_${farmId}`)
 * @param initial Valor inicial caso nao haja draft
 *
 * @example
 *   const { state, setState, clear } = useFormDraft('withdrawal', { qty: '', date: '' })
 *   // ... usar state nos inputs ...
 *   // apos submit OK:
 *   clear()
 */
export function useFormDraft<T extends object>(key: string, initial: T) {
  const storageKey = `stockdan_draft_${key}`
  const [state, setStateInternal] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return initial
      const draft = JSON.parse(raw) as T
      return { ...initial, ...draft }
    } catch {
      return initial
    }
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setState(next: T | ((prev: T) => T)) {
    setStateInternal((prev) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(value))
        } catch { /* quota — ignora */ }
      }, 500)
      return value
    })
  }

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current)
    try { localStorage.removeItem(storageKey) } catch {}
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { state, setState, clear }
}
