# Pendências StockDan

> Remova o item assim que resolvido. Ordenado por impacto.

---

## 🔴 Crítico — Camada Offline

### [OFFLINE-1] Idempotency key — elimina transação duplicada por falha de rede

**Problema:** O `QueueItem.id` existe mas não é enviado ao servidor. Se a resposta de uma requisição de sync se perde no ar (timeout, queda de rede após o servidor já ter inserido), o cliente faz retry e **debita o estoque duas vezes**.

**Solução:**

1. Migration: adicionar coluna `offline_id TEXT` em `transactions` com índice UNIQUE parcial (só para registros que vieram da fila offline):
   ```sql
   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS offline_id TEXT;
   CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_offline_id
     ON transactions (offline_id)
     WHERE offline_id IS NOT NULL;
   ```

2. Modificar o RPC `registrar_saida` em `supabase/migrations/` para aceitar `p_offline_id TEXT DEFAULT NULL` e, antes de inserir, verificar:
   ```sql
   IF p_offline_id IS NOT NULL THEN
     SELECT id, (SELECT quantity FROM insumos WHERE id = p_insumo_id)
       INTO v_tid, v_new_qty
       FROM transactions WHERE offline_id = p_offline_id;
     IF FOUND THEN
       RETURN json_build_object('transaction_id', v_tid, 'new_quantity', v_new_qty);
     END IF;
   END IF;
   ```

3. No sync (`hooks/useSyncQueue.ts`), incluir `offline_id: item.id` no body do POST.

4. No `app/api/farms/[id]/transactions/route.ts`, repassar `offline_id` para o RPC.

5. Atualizar `supabase/schema.sql` com a nova coluna e índice.

---

### [OFFLINE-2] Lock de sincronização — elimina duplicata por sync concorrente (2 abas)

**Problema:** `useSyncQueue` é instância React. Com 2 abas abertas, ambas disparam `sync()` ao mesmo tempo, leem o mesmo snapshot da fila e postam as mesmas transações. A flag `syncing` é por-instância, não cross-tab.

**Solução:** Criar `lib/syncLock.ts`:

```typescript
const LOCK_KEY = 'stockdan_sync_lock'
const LOCK_TTL = 30_000 // 30s

export const syncLock = {
  acquire(): boolean {
    try {
      const existing = localStorage.getItem(LOCK_KEY)
      if (existing) {
        const ts = Number(existing)
        if (Date.now() - ts < LOCK_TTL) return false // lock ativo
      }
      localStorage.setItem(LOCK_KEY, String(Date.now()))
      return true
    } catch { return false }
  },
  release() {
    try { localStorage.removeItem(LOCK_KEY) } catch {}
  },
}
```

Em `hooks/useSyncQueue.ts`, no início de `sync()`:
```typescript
if (!syncLock.acquire()) return { synced: 0, rejected: [] }
// ... todo o sync ...
// no finally:
syncLock.release()
```

---

### [OFFLINE-3] try-catch em write() — elimina perda silenciosa por localStorage cheio

**Problema:** `localStorage.setItem` lança `QuotaExceededError` silenciosamente quando o storage está cheio. O usuário vê "Retirada salva offline ✅" mas os dados nunca foram persistidos.

**Solução:** Em `lib/offlineQueue.ts` e `lib/insumoCache.ts`, envolver `write()`:

```typescript
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
```

Em `offlineQueue.add()`, capturar e propagar para o `WithdrawalForm` mostrar erro real em vez de sucesso falso.

---

### [OFFLINE-4] Timeout no fetch de sync — evita UI travada indefinidamente

**Problema:** `fetch()` sem timeout. Se o servidor pendurar, `setSyncing(true)` nunca chega em `false`. O banner "Sincronizando..." fica eterno.

**Solução:** Em `hooks/useSyncQueue.ts`, dentro do loop de sync:

```typescript
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 15_000)
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ... }),
    signal: controller.signal,
  })
  clearTimeout(timer)
  // ... resto do handling
} catch (e) {
  clearTimeout(timer)
  const exhausted = offlineQueue.incrementRetry(item.id)
  // ...
}
```

---

### [OFFLINE-5] Verificação de conectividade real antes de sync

**Problema:** `navigator.onLine = true` em área rural com 1 barra de sinal. Sync dispara, cada request timeout, após 5 tentativas o item é descartado permanentemente com "Máximo de tentativas atingido". **Dado perdido.**

**Solução:**

1. Criar `app/api/ping/route.ts`:
   ```typescript
   import { NextResponse } from 'next/server'
   export async function GET() {
     return NextResponse.json({ ok: true }, {
       headers: { 'Cache-Control': 'no-store' }
     })
   }
   ```
   Adicionar `/api/ping` em `PUBLIC_PATHS` do `proxy.ts`.

2. Em `hooks/useSyncQueue.ts`, antes de iniciar o loop:
   ```typescript
   async function verifyConnectivity(): Promise<boolean> {
     try {
       const r = await fetch('/api/ping', {
         signal: AbortSignal.timeout(4_000),
         cache: 'no-store',
       })
       return r.ok
     } catch { return false }
   }

   // No início de sync():
   if (!(await verifyConnectivity())) {
     return { synced: 0, rejected: [] }
   }
   ```

---

## 🟠 Alto — Camada Offline

### [OFFLINE-6] Retry apenas para erros transitórios — descartar permanentes imediatamente

**Problema:** Erros `401`, `403`, `404`, `400` nunca serão resolvidos por retry (sessão expirada, insumo deletado, etc.). O código atual faz 5 tentativas inúteis antes de descartar, com mensagem enganosa "Verifique a conexão".

**Solução:** Em `hooks/useSyncQueue.ts`, substituir o bloco `else`:

```typescript
const PERMANENT_ERRORS = [400, 401, 403, 404]

if (res.ok) {
  offlineQueue.remove(item.id)
  synced++
} else if (res.status === 422 || PERMANENT_ERRORS.includes(res.status)) {
  const body = await res.json().catch(() => ({}))
  offlineQueue.remove(item.id)
  const reason = res.status === 401
    ? 'Sessão expirada. Faça login novamente.'
    : res.status === 403
    ? 'Sem permissão para esta operação.'
    : res.status === 404
    ? 'Insumo ou talhão não encontrado (pode ter sido excluído).'
    : body.error ?? 'Dados inválidos.'
  rejected.push({ item, reason })
} else {
  // 5xx, rede — transitório, fazer retry
  const exhausted = offlineQueue.incrementRetry(item.id)
  if (exhausted) rejected.push({ item, reason: 'Servidor indisponível após várias tentativas.' })
}
```

---

### [OFFLINE-7] TTL no insumoCache — evita estoque obsoleto após reconexão longa

**Problema:** `lastUpdated` existe no `FarmCache` mas nunca é verificado. Cache pode ter semanas de idade e ainda ser usado para validar "estoque suficiente" offline.

**Solução:** Em `lib/insumoCache.ts`:

```typescript
const CACHE_TTL_MS = 4 * 60 * 60 * 1000 // 4 horas

getFarm(farmId: string): CachedInsumo[] {
  const entry = read()[farmId]
  if (!entry) return []
  const age = Date.now() - new Date(entry.lastUpdated).getTime()
  if (age > CACHE_TTL_MS) return [] // expirado — forçar busca no servidor
  return entry.insumos
},
```

Em `WithdrawalForm`, quando `insumoCache.getFarm()` retorna `[]` (expirado) mas `isOnline = false`, mostrar aviso: "Cache de estoque desatualizado. Os valores exibidos podem não ser precisos."

---

### [OFFLINE-8] pendingCount atualizado no início do sync — banner correto

**Problema:** `pendingCount` é setado uma vez no mount e só atualizado ao final do sync. O banner mostra "Sincronizando 0 operações pendentes..." quando na verdade há itens.

**Solução:** Em `hooks/useSyncQueue.ts`, no início de `sync()`:

```typescript
const items = offlineQueue.getAll()
if (items.length === 0) return { synced: 0, rejected: [] }

setPendingCount(items.length) // ← adicionar esta linha
setSyncing(true)
```

---

## 🟡 Médio — Service Worker

### [SW-1] Prompt de atualização em vez de skipWaiting agressivo

**Problema:** `self.skipWaiting()` no install ativa o novo SW imediatamente em todas as abas abertas, podendo corromper hidratação React durante um deploy.

**Solução:** Remover `self.skipWaiting()` do `install`. Adicionar listener no `SwRegistration.tsx`:

```typescript
reg.addEventListener('updatefound', () => {
  const newWorker = reg.installing
  newWorker?.addEventListener('statechange', () => {
    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
      // Mostrar toast/banner: "Nova versão disponível — clique para atualizar"
      // Ao clicar: newWorker.postMessage({ type: 'SKIP_WAITING' }) + window.location.reload()
    }
  })
})
```

No `sw.js`, adicionar handler:
```javascript
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
```

---

### [SW-2] Rota /api/ping excluída do service worker

**Dependência:** Criado em OFFLINE-5.

Garantir que `/api/ping` esteja coberta pelo `matcher` do `proxy.ts` como rota pública (sem auth), e que o SW não a intercepte (já está OK pois SW ignora `/api/`).

---

## Como usar este arquivo

- **Ao iniciar uma tarefa:** Comente brevemente o que está fazendo no item
- **Ao concluir:** Delete o bloco inteiro do item resolvido
- **Ao adicionar nova pendência:** Siga o mesmo formato — ID, problema, solução detalhada
- **IDs:** Use prefixo da área (`OFFLINE-`, `SW-`, `DB-`, `SEC-`) + número sequencial
