const CACHE = 'stockdan-v2'
const PRECACHE = ['/offline.html']

self.addEventListener('install', (event) => {
  // Não chama skipWaiting() aqui — aguarda o usuário confirmar a atualização
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})))
})

// [SW-1] Permite que a página acione a atualização manualmente
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Só intercepta GET same-origin, ignora API
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Assets estáticos do Next.js: cache-first (content-hashed, imutáveis)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((hit) =>
          hit ?? fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone()).catch(() => {})
            return res
          })
        )
      )
    )
    return
  }

  // Navegação (hard nav): network-first → cache → ignoreVary → offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone()).catch(() => {})
            return res
          })
          .catch(async () => {
            const hit =
              (await cache.match(request)) ??
              (await cache.match(request, { ignoreVary: true }))
            return hit ?? caches.match('/offline.html')
          })
      )
    )
    return
  }

  // RSC payloads e demais assets: stale-while-revalidate com fallback offline
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const networkPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone()).catch(() => {})
            return res
          })
          .catch(() => cached ?? new Response('', { status: 503 }))
        return cached ?? networkPromise
      })
    )
  )
})
