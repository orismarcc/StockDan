const CACHE = 'stockdan-v1'

// Assets garantidamente disponíveis offline após primeiro carregamento
const PRECACHE = ['/login', '/change-password']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Só intercepta GET
  if (request.method !== 'GET') return

  // API: nunca intercepta (queue é feita na camada da aplicação)
  if (url.pathname.startsWith('/api/')) return

  // Assets estáticos do Next.js: cache-first (são content-hashed, nunca mudam)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(request, clone))
          return res
        })
      })
    )
    return
  }

  // Páginas de navegação: network-first, fallback para cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(request, clone))
          return res
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? caches.match('/login'))
        )
    )
    return
  }

  // Demais assets (fontes, imagens): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        caches.open(CACHE).then((c) => c.put(request, res.clone()))
        return res
      })
      return cached ?? network
    })
  )
})
