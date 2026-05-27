# Padrões de Desenvolvimento — StockDan

> **REGRA OBRIGATÓRIA para qualquer task neste repositório.** Antes de implementar qualquer
> coisa nova, verifique os padrões abaixo. Antes de commitar, valide os checklists.
> Implementação que viola estes padrões será retrabalho.

---

## Princípios fundamentais (não negociáveis)

### P1 — Offline-first para operações de campo

**Toda operação que pode ser executada no campo (sem sinal) DEVE funcionar offline.**

Critério: se um operário no campo precisa registrar algo (retirada, regulagem, leitura, manejo), o caminho de escrita DEVE:
1. Detectar `useOnlineStatus()`
2. Online → fetch direto com `offline_id` no payload (idempotência também online — protege retry de timeout)
3. Offline → enfileirar via `mutationQueue.add(...)` e mostrar feedback "salvo offline"
4. Reconexão → `useSyncQueue` drena automaticamente

Operações puramente administrativas (CRUD de usuários, cadastrar fazenda, gerar relatório) podem permanecer online-only.

### P2 — Idempotência server-side é OBRIGATÓRIA para mutations

**Toda mutation que pode ser retentada DEVE ter chave de idempotência.**

- Schema: coluna `offline_id TEXT` + `CREATE UNIQUE INDEX uq_X_offline_id ON tabela (offline_id) WHERE offline_id IS NOT NULL`
- Cliente: gera `crypto.randomUUID()` por operação, mantém o MESMO id em todos os retries
- Servidor: antes de inserir, checa `WHERE offline_id = $1 AND farm_id = $2`; se existe, retorna o existente
- Race condition (`error.code === '23505'`) também trata como sucesso idempotente (re-busca e retorna)

### P3 — Multi-user reconciliation

**Sempre considere dois usuários offline simultaneamente operando na mesma entidade.**

- **Aditivas** (movimentos, transactions): cada operação tem offline_id único → todas persistem → saldo derivado pela RPC atômica. Sem conflito.
- **Updates (PATCH):** LWW por `updated_at_client`:
  - Cliente: `updated_at_client: new Date().toISOString()` no body
  - Servidor: se `server.updated_at > updated_at_client`, retorna 200 com header `X-Conflict-Resolution: server-wins` e o estado atual (sem aplicar mudança)
  - Cliente: detecta header → reconcilia (`router.refresh()`)
- **Deletes:** idempotentes — 200 mesmo se já estava deletado (404 em DELETE = sucesso para retry offline)

### P4 — RPC atômica para escrita multi-tabela

**NUNCA faça duas mutations sequenciais sem transação.**

- Migration cria função `PL/pgSQL` com `SECURITY DEFINER`
- Faça `SELECT ... FOR UPDATE` quando precisa serializar concorrência (lock pessimista)
- Exemplo: `registrar_saida` atualiza `insumos.quantity` + insere em `transactions` na mesma TX
- API chama via `supabase.rpc('nome', { p_...: ... })` e trata erro com `parseRpcError`

### P5 — Sessão segura com invalidação imediata

**Mudança de role DEVE propagar em segundos, não em dias.**

- JWT em cookie HTTP-only, TTL 7d, contém `tv` (token_version)
- `users.token_version INTEGER NOT NULL DEFAULT 0`
- `verifyTokenStrict` compara JWT.tv contra DB.token_version (cache 30s para perf)
- Mutation que muda role: `UPDATE users SET token_version = token_version + 1` + `invalidateTokenVersionCache(uid)`

### P6 — Validação no servidor, sem confiar no cliente

- `lib/validate.ts`: `isUUID`, `isValidDate`, `isValidQuantity`, `withinLength`, `trimField`, `isValidAreaHa`
- `parseBody(req)` retorna `null` se body inválido → responda 400 `{error: 'Requisição inválida.'}`
- NUNCA exponha `error.message` do Supabase ao cliente (vaza schema). Use `parseRpcError` ou `{error: 'Erro interno. Tente novamente.'}` 500

### P7 — Controle de acesso por fazenda

- Toda route sob `/api/farms/[id]/...` começa com `checkFarmAccess(supabase, session, farm_id)` → 403 se sem acesso
- Routes admin-only: `if (session.role !== 'admin') return 403`
- Operários SÓ retiradas; admin tudo o resto

---

## Templates de código

### Template — API Route POST com idempotency

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { isUUID } from '@/lib/validate'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id: farm_id } = await params
  const supabase = createServerClient()

  if (!(await checkFarmAccess(supabase, session, farm_id))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const offline_id = body.offline_id ?? null
  if (offline_id !== null && !isUUID(offline_id)) {
    return NextResponse.json({ error: 'offline_id inválido.' }, { status: 400 })
  }

  // Idempotency check
  if (offline_id) {
    const { data: existing } = await supabase
      .from('TABLE')
      .select('*')
      .eq('offline_id', offline_id)
      .eq('farm_id', farm_id)
      .maybeSingle()
    if (existing) return NextResponse.json(existing, { status: 201 })
  }

  // ... validações de domínio ...

  const { data, error } = await supabase
    .from('TABLE')
    .insert({ /* ... */, offline_id: offline_id || null })
    .select()
    .single()

  if (error) {
    // Race: outro request com mesmo offline_id chegou primeiro
    if (offline_id && (error as { code?: string }).code === '23505') {
      const { data: existing } = await supabase
        .from('TABLE').select('*').eq('offline_id', offline_id).eq('farm_id', farm_id).maybeSingle()
      if (existing) return NextResponse.json(existing, { status: 201 })
    }
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

### Template — API Route PATCH com LWW

```ts
export async function PATCH(req: NextRequest, { params }: Params) {
  // ... auth + access check ...

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const updated_at_client = body.updated_at_client ?? null

  // LWW: server vence se foi modificado depois que cliente fez a mudança
  if (updated_at_client) {
    const { data: current } = await supabase
      .from('TABLE')
      .select('*')
      .eq('id', xid)
      .eq('farm_id', farm_id)
      .maybeSingle()

    if (current && current.updated_at && current.updated_at > updated_at_client) {
      return NextResponse.json(current, {
        status: 200,
        headers: { 'X-Conflict-Resolution': 'server-wins' },
      })
    }
  }

  const { data, error } = await supabase
    .from('TABLE')
    .update({ /* fields */, updated_at_client: updated_at_client || null })
    .eq('id', xid)
    .eq('farm_id', farm_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
}
```

### Template — Client Form com suporte offline

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { mutationQueue } from '@/lib/mutationQueue'

export function MyForm({ farmId, ...props }: Props) {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [offlineOk, setOfflineOk] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setOfflineOk(false)

    const payload = { /* form fields */ }

    // OFFLINE
    if (!isOnline) {
      try {
        mutationQueue.add({
          entity: 'ENTITY_NAME',  // adicionar em MutationEntity em lib/mutationQueue.ts
          op: 'POST',
          endpoint: `/api/...`,
          payload,
        })
        setSaving(false); setOfflineOk(true)
        setTimeout(() => router.refresh(), 2500)
      } catch (e) {
        setSaving(false)
        setError(e instanceof Error && e.message === 'STORAGE_FULL'
          ? 'Armazenamento local cheio.'
          : 'Falha ao salvar localmente.')
      }
      return
    }

    // ONLINE — sempre envia offline_id e updated_at_client
    const offline_id = crypto.randomUUID()
    const updated_at_client = new Date().toISOString()
    const res = await fetch(`/api/...`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, offline_id, updated_at_client }),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erro ao salvar.')
      return
    }
    if (res.headers.get('X-Conflict-Resolution') === 'server-wins') {
      setError('Outro usuário alterou. Recarregando...')
      setTimeout(() => router.refresh(), 2000)
      return
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      {!isOnline && <OfflineBanner />}
      {/* ... fields ... */}
      {error && <ErrorBox>{error}</ErrorBox>}
      {offlineOk && <OkOfflineBox />}
    </form>
  )
}
```

### Template — Migration

```sql
-- Migration: [PROBLEMA que motivou + SOLUÇÃO em 2-3 linhas]
--
-- (contexto técnico, exemplos de cenário)

-- Idempotente: pode rodar múltiplas vezes sem erro
ALTER TABLE tabela
  ADD COLUMN IF NOT EXISTS offline_id        TEXT,
  ADD COLUMN IF NOT EXISTS updated_at_client TIMESTAMPTZ;

COMMENT ON COLUMN tabela.offline_id IS
  'Chave de idempotencia para operacoes offline.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tabela_offline_id
  ON tabela (offline_id)
  WHERE offline_id IS NOT NULL;
```

---

## Checklist antes de commitar

- [ ] `npx tsc --noEmit` → exit 0
- [ ] Padrões P1-P7 respeitados (offline, idempotency, multi-user, RPC, auth, validação, access)
- [ ] Mutation tem `offline_id` no schema + check no servidor
- [ ] PATCH considera `updated_at_client` (se entidade pode ter conflito)
- [ ] DELETE é idempotente
- [ ] Validação de TODOS os campos do body
- [ ] Mensagens de erro genéricas em 500 (sem `error.message` do Supabase)
- [ ] Migration idempotente (`IF NOT EXISTS`, `OR REPLACE`)
- [ ] Build local opcional (`npx next build`) se mexeu em SW/manifest/favicon

## Checklist depois de commitar

- [ ] `git push origin master`
- [ ] `npx vercel ls --prod` até ver `● Ready`
- [ ] Se `● Error`: investigar logs com `npx vercel logs URL` ou MCP `get_deployment_build_logs`
- [ ] NÃO claim "feito" antes de `● Ready` em prod
- [ ] Se mexeu em algo crítico: documentar caso de teste manual

---

## Antipadrões — não fazer

| ❌ Antipattern | ✅ Pattern correto |
|---|---|
| `await supabase.from(A).update()` + `await supabase.from(B).insert()` separados | RPC atômica em PL/pgSQL |
| `error.message` do Supabase no response | `{error: 'Erro interno. Tente novamente.'}` 500 |
| `await req.json()` direto | `parseBody(req)` que trata body inválido |
| Form que faz `fetch` sem checar `useOnlineStatus` | Usar template offline-aware |
| POST sem `offline_id` quando pode vir do offline ou retry | Sempre incluir, mesmo online |
| PATCH sem `updated_at_client` em entidade multi-user | Sempre incluir + LWW no servidor |
| `getSession()` em route que precisa bloquear `mustChangePassword` | `getActiveSession()` |
| Claim "deploy ok" sem ver `● Ready` | Esperar Vercel ready |
| Commit sem TSC passar | `npx tsc --noEmit` primeiro |
| Migration sem `IF NOT EXISTS` | Sempre idempotente |
| Skip hooks `--no-verify` | Investigar falha do hook |

---

## Quando em dúvida

1. **Já existe padrão em outro lugar?** Seguir 100%. Ex: novo CRUD = mesmo formato de `implement-adjustments`.
2. **Operação de campo?** `mutationQueue` + migration `offline_id`/`updated_at_client` + form com `useOnlineStatus`.
3. **Operação admin?** Online-only OK, mas `getActiveSession + role check + checkFarmAccess`.
4. **Mudou role/permissão?** Incrementar `token_version` + `invalidateTokenVersionCache`.
5. **Sentiu duplicação de código?** Mover para `lib/`. Componentes/routes pequenos.
6. **Spec ambígua?** Perguntar antes de codar. Não inventar.

---

## Arquitetura

```
stockdan-app/
├── app/                    Next.js App Router
│   ├── (auth)/             Login/change-password
│   ├── (app)/              App principal
│   │   ├── admin/users/
│   │   ├── dashboard/
│   │   ├── farms/[id]/
│   │   └── analise/
│   ├── api/                REST endpoints
│   │   ├── auth/
│   │   ├── farms/
│   │   ├── users/
│   │   └── ping/
│   └── layout.tsx
├── components/             React shared
├── hooks/
│   ├── useOnlineStatus.ts
│   └── useSyncQueue.ts     Drena offlineQueue + mutationQueue
├── lib/
│   ├── auth.ts             JWT + token_version
│   ├── supabase.ts         Server client
│   ├── farmAccess.ts       checkFarmAccess()
│   ├── validate.ts         Validações
│   ├── rpcErrors.ts        parseRpcError()
│   ├── utils.ts            parseBody, formatadores
│   ├── offlineQueue.ts     [específica] Retiradas
│   ├── mutationQueue.ts    [genérica] Outras mutations
│   ├── insumoCache.ts
│   ├── syncLock.ts
│   └── rateLimiter.ts
├── public/sw.js, manifest.json, icons/
├── scripts/migrate.js, generate-pwa-icons.mjs
├── supabase/migrations/    SQL incremental
└── docs/                   Auditorias + standards
```

---

**Última atualização:** 2026-05-27 — após implementação de regulagens offline + token_version.
**Próxima revisão:** sempre que adicionar nova categoria de operação (ex: irrigação, fertilização).
