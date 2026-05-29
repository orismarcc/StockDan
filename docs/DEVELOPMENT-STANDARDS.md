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

**Regra obrigatória — `getSession()` vs `getActiveSession()`:**

| Função | O que faz | Onde usar |
|---|---|---|
| `getActiveSession()` | Valida sessão E retorna null se `mustChangePassword=true` | **Todos** os API routes com dados reais |
| `getSession()` | Valida sessão apenas (ignora mustChangePassword) | Somente `/api/auth/change-password`, `/api/auth/logout` e `generateMetadata` |

```ts
// ✅ Correto — API routes comuns
const session = await getActiveSession()
if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

// ✅ Correto — generateMetadata (não bloqueia, só lê título)
export async function generateMetadata() {
  const session = await getSession()
  if (!session) return { title: 'StockDan' }
  // ...
}

// ❌ Errado — usar getSession() em route com dados sensíveis
// Usuário com mustChangePassword consegue acessar dados
```

### P6 — Validação no servidor, sem confiar no cliente

- `lib/validate.ts`: `isUUID`, `isValidDate`, `isValidQuantity`, `withinLength`, `trimField`, `isValidAreaHa`
- `parseBody(req)` retorna `null` se body inválido → responda 400 `{error: 'Requisição inválida.'}`
- NUNCA exponha `error.message` do Supabase ao cliente (vaza schema). Use `parseRpcError` ou `{error: 'Erro interno. Tente novamente.'}` 500

**Regra obrigatória — verificação de colunas antes de qualquer SELECT:**

Antes de escrever `supabase.from('tabela').select('col1, col2')`, verifique que as colunas existem em `supabase/schema.sql`. Selecionar coluna inexistente faz o Supabase retornar `error` → `data = null` silenciosamente, sem exceção, causando bugs difíceis de rastrear (ex: `data = null` onde se espera lista → 0 itens exibidos).

```ts
// ANTES de escrever isso:
supabase.from('talhoes').select('id, name, area_ha, description, updated_at')
// Verifique no schema: talhoes tem 'description'? tem 'updated_at'?
// Se não tiver → Supabase retorna null sem aviso → bug silencioso
```

### P7 — Controle de acesso por fazenda

- Toda route sob `/api/farms/[id]/...` começa com `checkFarmAccess(supabase, session, farm_id)` → 403 se sem acesso
- Gestor: aceito se `farms.owner_id = session.id`
- Outros cargos (admin/agronomo/operario): aceito se existe linha em `farm_users (user_id=session.id, farm_id=X)` E `farms.owner_id = session.gestor_id` (defesa em profundidade)
- NUNCA confiar em IDs vindos do client sem este check

### P8 — Multi-tenant por Gestor

**Toda query que retorna dados sensíveis DEVE filtrar por `session.gestor_id`.**

- Cada usuário tem `gestor_id` (coluna NOT NULL na tabela `users`) apontando para o Gestor do seu tenant. Gestor aponta para si próprio.
- Listagens de usuários: `WHERE gestor_id = session.gestor_id`
- Vincular fazendas a um usuário: TODAS as fazendas em `farm_ids` precisam ter `owner_id = session.gestor_id`. Se não, retornar 403.
- NUNCA confie em `created_by` para tenancy — é só audit.
- Quando criar usuário via API, `gestor_id` é setado a partir de `session.gestor_id` (herda tenant do criador). Não aceite `gestor_id` do body.

### P9 — Permission check via capability matrix

**NUNCA compare `session.role === 'admin'` direto em route handlers.**

- Use `can(session.role, 'namespace.action')` de `lib/permissions.ts` (fonte única de verdade)
- Para checar se ator pode gerenciar alvo: `canManageUser(actorRole, targetRole)` — Admin não pode mexer em Gestor
- Mudança de role: incrementa `token_version` do alvo + `invalidateTokenVersionCache(targetId)` (P5 reuso)
- 4 cargos: `gestor` (root do tenant), `admin`, `agronomo`, `operario`

**Manutenção do `proxy.ts`:** quando adicionar novo cargo privilegiado ou nova rota admin-only, atualizar `adminOnlyPaths` E o array de roles permitidos no `proxy.ts`. Esquecer isso bloqueia o cargo correto de acessar rotas que deveria.

### P10 — withAuth HOF para todo route handler novo

**Todo route handler novo DEVE ser criado com `withAuth` em vez de chamar `getActiveSession()` manualmente.**

- `lib/withAuth.ts`: HOF que garante sessão ativa antes de executar o handler
- Retorna 401 automaticamente se não autenticado — handler nunca recebe request sem sessão
- Handlers existentes (criados antes de P10) mantêm o padrão antigo — não refatorar sem necessidade
- Fail-safe: se esquecer de usar `withAuth`, o `proxy.ts` ainda bloqueia requests sem token (P10 é defesa em profundidade, não única camada)

```ts
// NOVO padrão (use sempre em novas rotas)
export const GET = withAuth(async (req, session) => { ... })
export const POST = withAuth(async (req, session) => { ... })

// Com params de URL
export const DELETE = withAuth<{ id: string }>(async (req, session, params) => {
  const { id } = await params!
  if (!can(session.role, 'farm.delete')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }
  // ...
})
```

### P11 — Audit log para ações destrutivas e sensíveis

**Toda ação irreversível ou sensível DEVE chamar `logAudit()` após executar com sucesso.**

Regra de quando logar:

| Ação | Logar? |
|---|---|
| DELETE de qualquer entidade (fazenda, talhão, insumo) | ✅ Sim |
| PATCH/DELETE de usuário (inclui mudança de role) | ✅ Sim |
| Criação de usuário | ✅ Sim |
| Criação de fazenda/talhão/insumo | ❌ Não (não é ação de governança) |
| Registro de aplicação/regulagem | ❌ Não (dado operacional) |

```ts
// Sempre APÓS a operação ter sucesso (não antes)
await logAudit(supabase, session, {
  action: 'delete',          // 'create' | 'update' | 'delete'
  entity: 'talhao',          // 'farm' | 'talhao' | 'insumo' | 'transaction' | 'adjustment' | 'user'
  entity_id: tid,
  farm_id: farm_id,          // null se não relacionado a fazenda
  summary: `Excluiu talhão "${name}" (${area_ha} ha)`,
  changes: { before: snap }, // snapshot opcional do estado anterior
})
```

- `logAudit` é fire-and-forget — falha de log NÃO falha a operação principal
- Filtra por `gestor_id` automaticamente via `session.gestor_id`
- Visível em `/admin/audit` apenas para cargos `gestor` e `admin`

### P12 — Security headers HTTP

**Todo response da aplicação deve incluir headers de segurança configurados em `next.config.ts`.**

Headers ativos (configurados via `headers()` no `next.config.ts`):

| Header | Valor | Proteção |
|---|---|---|
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leak de URL |
| `Permissions-Policy` | desativa câmera/microfone/localização | API abuse |
| `Content-Security-Policy` | restritivo com allowlist | XSS |

**Nunca remover ou enfraquecer estes headers sem revisão de segurança.**
Se uma feature nova precisar relaxar a CSP (ex: embeds externos), discutir antes — geralmente há alternativa.

---

## Templates de código

### Template — API Route POST com idempotency

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { checkFarmAccess } from '@/lib/farmAccess'
import { parseBody } from '@/lib/utils'
import { isUUID } from '@/lib/validate'
import { withAuth } from '@/lib/withAuth'

type Params = { id: string }

// P10: withAuth garante sessão — handler nunca roda sem autenticação
export const POST = withAuth<Params>(async (req, session, paramsPromise) => {
  const { id: farm_id } = await paramsPromise!
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
})
```

### Template — API Route PATCH com LWW

```ts
export const PATCH = withAuth<{ id: string }>(async (req, session, paramsPromise) => {
  const { id } = await paramsPromise!
  const supabase = createServerClient()

  // ... checkFarmAccess + capability check ...

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const updated_at_client = body.updated_at_client ?? null

  // LWW: server vence se foi modificado depois que cliente fez a mudança
  if (updated_at_client) {
    const { data: current } = await supabase
      .from('TABLE')
      .select('*')
      .eq('id', id)
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
    .eq('id', id)
    .eq('farm_id', farm_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data)
})
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

### Template — Route admin com capability + tenant

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { can, canManageUser } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { withAuth } from '@/lib/withAuth'

// P10: withAuth garante sessão antes de qualquer lógica
export const PATCH = withAuth<{ uid: string }>(async (req, session, paramsPromise) => {
  // P9: capability check
  if (!can(session.role, 'user.edit')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { uid } = await paramsPromise!
  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const supabase = createServerClient()

  // P8: validar mesmo tenant
  const { data: target } = await supabase
    .from('users').select('id, role, gestor_id, token_version')
    .eq('id', uid).maybeSingle()
  if (!target || target.gestor_id !== session.gestor_id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  if (!canManageUser(session.role, target.role)) {
    return NextResponse.json({ error: 'Sem permissão para este usuário.' }, { status: 403 })
  }

  // P8: validar que farm_ids (se houver) pertencem ao tenant
  if (Array.isArray(body.farm_ids) && body.farm_ids.length > 0) {
    const { data: owned } = await supabase
      .from('farms').select('id')
      .eq('owner_id', session.gestor_id)
      .in('id', body.farm_ids)
    if ((owned?.length ?? 0) !== body.farm_ids.length) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }
  }

  // ... resto da mutation ...
  // P5: se mudou role, incrementar token_version + invalidar cache
})
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
- [ ] Padrões P1-P12 respeitados
- [ ] Colunas do SELECT verificadas contra `supabase/schema.sql` (P6)
- [ ] Novas rotas usam `withAuth` (P10)
- [ ] Ações destrutivas chamam `logAudit()` (P11)
- [ ] Mutation tem `offline_id` no schema + check no servidor (P2)
- [ ] PATCH considera `updated_at_client` se entidade pode ter conflito (P3)
- [ ] DELETE é idempotente (P3)
- [ ] Validação de TODOS os campos do body (P6)
- [ ] Mensagens de erro genéricas em 500 — sem `error.message` do Supabase (P6)
- [ ] Migration idempotente (`IF NOT EXISTS`, `OR REPLACE`) (P4)
- [ ] Se adicionou novo cargo/rota privilegiada: `proxy.ts` atualizado (P9)
- [ ] Build local opcional (`npx next build`) se mexeu em SW/manifest/favicon

## Checklist depois de commitar

- [ ] `git push origin master`
- [ ] Aguardar Vercel deploy → `● Ready` (via `npx vercel ls` ou dashboard)
- [ ] Se `● Error`: investigar logs com `npx vercel logs URL` ou MCP `get_deployment_build_logs`
- [ ] NÃO afirmar "feito" antes de `● Ready` em produção
- [ ] Se mexeu em algo crítico: rodar smoke test manual nas páginas afetadas

---

## Antipadrões — não fazer

| ❌ Antipattern | ✅ Pattern correto |
|---|---|
| `await supabase.from(A).update()` + `await supabase.from(B).insert()` separados | RPC atômica em PL/pgSQL (P4) |
| `error.message` do Supabase no response | `{error: 'Erro interno. Tente novamente.'}` 500 (P6) |
| `await req.json()` direto | `parseBody(req)` com try-catch interno (P6) |
| SELECT de coluna sem verificar schema | Verificar `supabase/schema.sql` antes (P6) |
| Form que faz `fetch` sem checar `useOnlineStatus` | Usar template offline-aware (P1) |
| POST sem `offline_id` quando pode vir do offline ou retry | Sempre incluir, mesmo online (P2) |
| PATCH sem `updated_at_client` em entidade multi-user | Sempre incluir + LWW no servidor (P3) |
| `getSession()` em route que precisa bloquear `mustChangePassword` | `getActiveSession()` (P5) |
| `getActiveSession()` em `generateMetadata` | `getSession()` — metadata não bloqueia (P5) |
| `getActiveSession()` manual em route handler novo | `withAuth(async (req, session) => { ... })` (P10) |
| DELETE/PATCH sensível sem chamar `logAudit()` | `await logAudit(supabase, session, { ... })` (P11) |
| Novo cargo privilegiado sem atualizar `proxy.ts` | Atualizar `adminOnlyPaths` e roles permitidos (P9) |
| Claim "deploy ok" sem ver `● Ready` | Esperar Vercel ready |
| Commit sem TSC passar | `npx tsc --noEmit` primeiro |
| Migration sem `IF NOT EXISTS` | Sempre idempotente |
| Skip hooks `--no-verify` | Investigar falha do hook |
| `session.role === 'admin'` em route handler | `can(session.role, 'namespace.action')` (P9) |
| Listar/filtrar por `created_by` | `WHERE gestor_id = session.gestor_id` (P8) |
| Aceitar `farm_id` do body sem validar ownership | `SELECT FROM farms WHERE owner_id = session.gestor_id AND id IN (...)` (P7) |
| Inserir user com `gestor_id` vindo do body | `gestor_id: session.gestor_id` sempre (P8) |

---

## Quando em dúvida

1. **Já existe padrão em outro lugar?** Seguir 100%. Ex: novo CRUD = mesmo formato de `implement-adjustments`.
2. **Operação de campo?** `mutationQueue` + migration `offline_id`/`updated_at_client` + form com `useOnlineStatus`.
3. **Operação admin?** Online-only OK, mas `withAuth` + capability check + `checkFarmAccess`.
4. **Mudou role/permissão?** Incrementar `token_version` + `invalidateTokenVersionCache`.
5. **Criando endpoint que lista/edita usuários ou vincula fazendas?** Sempre `WHERE gestor_id = session.gestor_id` + validar ownership de `farm_ids` (P8).
6. **Verificando se um cargo pode fazer X?** `can(role, 'namespace.action')` — nunca string comparison (P9).
7. **Ação destrutiva ou sensível?** Chamar `logAudit()` após sucesso (P11).
8. **Sentiu duplicação de código?** Mover para `lib/`. Componentes/routes pequenos.
9. **Spec ambígua?** Perguntar antes de codar. Não inventar.
10. **Adicionando SELECT no Supabase?** Verificar todas as colunas em `supabase/schema.sql` antes (P6).

---

## Arquitetura

```
stockdan-app/
├── app/                    Next.js App Router
│   ├── (auth)/             Login/change-password
│   ├── (app)/              App principal
│   │   ├── admin/          Auditoria, Usuários, Relatórios (gestor + admin)
│   │   ├── dashboard/
│   │   ├── farms/[id]/
│   │   └── analise/
│   ├── api/                REST endpoints
│   │   ├── auth/           login, logout, change-password, refresh
│   │   ├── farms/          CRUD fazendas + sub-recursos
│   │   ├── users/          Gestão de usuários (tenant-scoped)
│   │   ├── audit/          Leitura de audit_log (gestor/admin)
│   │   ├── reports/        Relatórios agendados
│   │   ├── analise/        Geração de PDF/Excel
│   │   ├── cron/           Jobs agendados (send-reports)
│   │   └── ping/           Health check (público)
│   └── layout.tsx
├── proxy.ts                Middleware Next.js 16 — auth fast-check + role guards
│                           (⚠️ atualizar quando adicionar novos cargos/rotas admin)
├── next.config.ts          Security headers HTTP (P12) + configuração Next.js
├── components/             React shared
├── hooks/
│   ├── useOnlineStatus.ts
│   └── useSyncQueue.ts     Drena offlineQueue + mutationQueue
├── lib/
│   ├── auth.ts             JWT + token_version + getSession/getActiveSession
│   ├── supabase.ts         Server client
│   ├── farmAccess.ts       checkFarmAccess() — P7
│   ├── permissions.ts      can() + canManageUser() + roleLabel() — P9
│   ├── validate.ts         Validações de domínio — P6
│   ├── rpcErrors.ts        parseRpcError()
│   ├── utils.ts            parseBody (com try-catch), formatadores
│   ├── withAuth.ts         P10: HOF de autenticação para route handlers
│   ├── audit.ts            logAudit() fire-and-forget — P11
│   ├── rateLimiter.ts      Rate limit via Upstash Redis (global entre Lambdas)
│   ├── offlineQueue.ts     [específica] Retiradas
│   ├── mutationQueue.ts    [genérica] Outras mutations
│   ├── insumoCache.ts
│   └── syncLock.ts
├── public/sw.js, manifest.json, icons/
├── scripts/migrate.js, generate-pwa-icons.mjs
├── supabase/
│   ├── schema.sql          ← CONSULTAR antes de qualquer SELECT (P6)
│   └── migrations/         SQL incremental idempotente
└── docs/                   Auditorias + standards
```

---

**Última atualização:** 2026-05-29
**Mudanças desta versão:**
- P5: regra clara de `getSession()` vs `getActiveSession()` com tabela de uso (C-1, C-2)
- P6: regra de verificação de colunas contra `supabase/schema.sql` (lição dos bugs de hoje)
- P9: nota de manutenção do `proxy.ts` ao adicionar roles/rotas (lição dos bugs de hoje)
- P10: `withAuth` HOF — padrão para novos route handlers (C-3)
- P11: Audit log — regra de quando/o que registrar (SUG-4)
- P12: Security headers HTTP — referência ao `next.config.ts` (A-4)
- Checklist atualizado para P1-P12
- Antipatterns: 5 novos itens adicionados
- "Quando em dúvida": 4 novos itens, numeração corrigida
- Arquitetura: `proxy.ts`, `next.config.ts`, `withAuth.ts`, `audit.ts`, `rateLimiter.ts` documentados

**Próxima revisão:** sempre que adicionar nova categoria de operação, novo cargo ou nova camada de segurança.
