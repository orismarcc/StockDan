const CACHE = 'stockdan-v5'

// Shell do app — carregado na instalação do SW
const PRECACHE = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
]

// Páginas críticas para precache dinâmico — visitadas no campo, devem estar
// acessíveis offline mesmo se nunca foram abertas antes nesta sessão.
// O precache acontece após o install, sob demanda — não bloqueia a instalação.
const CRITICAL_ROUTES = [
  '/dashboard',
  '/farms',
]

// ── Install: precache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  )
  // NÃO chama skipWaiting() — aguarda confirmação do usuário via SwRegistration
  // (evita interromper usuário que está editando algo offline)
})

// ── Message: atualização manual ──────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ── Activate: limpa caches antigos + warm-up de rotas críticas ──────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => warmUpCriticalRoutes())
  )
})

// Precache de rotas críticas em background após activate. Best-effort — não
// quebra o SW se falhar (ex: user não autenticado retorna 307 redirect).
async function warmUpCriticalRoutes() {
  try {
    const cache = await caches.open(CACHE)
    await Promise.all(
      CRITICAL_ROUTES.map(async (path) => {
        try {
          const res = await fetch(path, { credentials: 'include' })
          if (res.ok) await cache.put(path, res.clone())
        } catch { /* offline ou erro — ignora */ }
      })
    )
  } catch { /* ignora */ }
}

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Assets estáticos do Next.js (content-hashed, imutáveis) — cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone()).catch(() => {})
              return res
            })
        )
      )
    )
    return
  }

  // Ícones e manifest — cache-first
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone()).catch(() => {})
              return res
            })
        )
      )
    )
    return
  }

  // Navegação — network-first com fallback para cache → HTML inline
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(request)
          .then((res) => {
            // Não cacheia respostas 401 nem redirecionamentos para /login
            const redirectedToLogin = res.url && res.url.includes('/login')
            if (res.ok && !redirectedToLogin) {
              cache.put(request, res.clone()).catch(() => {})
            } else if (res.status === 401 || redirectedToLogin) {
              // Limpa cache de páginas autenticadas para evitar servir
              // conteúdo de outro usuário após logout/troca de conta
              cache.keys().then((keys) =>
                Promise.all(
                  keys
                    .filter((k) => !k.url.startsWith(self.location.origin + '/_next/'))
                    .map((k) => cache.delete(k))
                )
              )
            }
            return res
          })
          .catch(async () => {
            const hit =
              (await cache.match(request)) ??
              (await cache.match(request, { ignoreVary: true }))
            return hit ?? new Response(
              '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>StockDan — Offline</title><style>body{font-family:system-ui,sans-serif;background:#030712;color:#e5e7eb;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;text-align:center}h1{color:#22c55e;margin-bottom:.5rem}p{color:#9ca3af;max-width:28rem;line-height:1.5}button{margin-top:1.5rem;padding:.75rem 1.25rem;background:#22c55e;color:white;border:none;border-radius:.5rem;font-weight:600;cursor:pointer}button:hover{background:#16a34a}</style></head><body><h1>Sem conexão</h1><p>Esta página ainda não está disponível offline. Você pode tentar acessá-la novamente quando estiver com sinal — ou abra páginas que já foram visitadas antes.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',
              {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
                status: 503,
              }
            )
          })
      )
    )
    return
  }

  // RSC payloads e demais — stale-while-revalidate
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
