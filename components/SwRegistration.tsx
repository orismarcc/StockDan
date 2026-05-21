'use client'

import { useEffect } from 'react'

export function SwRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => { /* SW registration is best-effort */ })
    }
  }, [])

  return null
}
