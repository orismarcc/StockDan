'use client'

import { useEffect, useRef } from 'react'

/**
 * useFarmPrefetch — quando online, faz fetch das sub-rotas criticas da fazenda
 * para que o Service Worker as armazene em cache. Assim o operario consegue
 * acessar essas paginas offline mesmo sem ter visitado antes nesta sessao.
 *
 * Disparado uma vez por (farmId, talhaoIds), best-effort. Failures silenciosos.
 *
 * @param farmId    UUID da fazenda
 * @param talhaoIds IDs dos talhoes (opcional) — pre-fetch detalhes de cada um
 */
export function useFarmPrefetch(farmId: string | null | undefined, talhaoIds: string[] = []) {
  // Evita prefetch repetido (StrictMode / re-renders)
  const doneRef = useRef<string | null>(null)

  useEffect(() => {
    if (!farmId) return
    if (typeof navigator === 'undefined' || !navigator.onLine) return

    // Key estavel pra detectar mudanca real do conjunto a precachear
    const key = `${farmId}::${[...talhaoIds].sort().join(',')}`
    if (doneRef.current === key) return
    doneRef.current = key

    const urls = [
      `/farms/${farmId}`,
      `/farms/${farmId}/retirada`,
      `/farms/${farmId}/talhoes`,
      ...talhaoIds.map(tid => `/farms/${farmId}/talhoes/${tid}`),
    ]

    // Best-effort: fetch silencioso. SW intercepta e cacha em network-first.
    // requestIdleCallback se disponivel (nao bloqueia thread principal)
    const run = () => {
      urls.forEach(url => {
        fetch(url, {
          credentials: 'include',
          cache: 'no-cache',  // forca round-trip mas SW pode cachear a resposta
        }).catch(() => {})    // ignora falhas
      })
    }

    const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    if (typeof idle === 'function') {
      idle(run)
    } else {
      setTimeout(run, 500)  // fallback: aguarda 500ms apos render
    }
  }, [farmId, talhaoIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
}
