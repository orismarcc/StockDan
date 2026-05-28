# Hierarquia de Cargos + Multi-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar de `admin/operario` para 4 cargos (`gestor`, `admin`, `agronomo`, `operario`) com isolamento multi-tenant por Gestor + corrigir bug de cross-tenant em vinculações de farm_users + adicionar label "aplicados" no % da tabela de talhões.

**Architecture:** Tenancy por `gestor_id` (nova coluna em `users`). Gestor é raiz do tenant; demais cargos apontam para ele e precisam de `farm_users` explícito por fazenda. Capability matrix em `lib/permissions.ts` substitui comparações `role === 'admin'` ao longo do código. Migração de dados converte admins atuais → gestores e backfill `gestor_id` por `created_by`.

**Tech Stack:** Next.js 16 App Router · Supabase (PostgreSQL) · JWT custom (jose + bcryptjs) · TypeScript estrito

**Padrões obrigatórios:** P1–P9 de `docs/DEVELOPMENT-STANDARDS.md`. Especialmente P5 (token_version), P6 (validação server-side sem vazar `error.message`), P7 (`checkFarmAccess`), **P8 (multi-tenant)**, **P9 (capability matrix)**.

**Verificação:** este codebase não usa test suite automatizada. Cada task tem `npx tsc --noEmit` + verificação manual via cURL/UI especificada. Build local opcional antes de commit.

**Deploy:** após cada commit substantivo, push + Vercel `--prod` + esperar `● Ready`. NÃO claim "feito" antes disso (regra do CLAUDE.md).

---

## File Structure

**Novos:**
- `lib/permissions.ts` — capability matrix + helpers (`can`, `canManageUser`)
- `supabase/migrations/20260527000005_user_roles_hierarchy.sql` — schema + backfill

**Modificados (ordem importa):**
- `lib/auth.ts` — `Session.gestor_id`, `Role` type
- `app/api/auth/login/route.ts` — incluir `gestor_id` no JWT
- `app/api/auth/refresh/route.ts` — idem
- `lib/farmAccess.ts` — nova regra de acesso por tenant
- `app/api/users/route.ts` — list filtrado por tenant + criação com `gestor_id` herdado
- `app/api/users/[uid]/route.ts` — PATCH/DELETE com tenant + capability + farm_ids validation
- `app/api/farms/route.ts` — `can('farm.create')`
- `app/api/farms/[id]/route.ts` — `can('farm.edit')`, `can('farm.delete')`
- `app/api/farms/[id]/insumos/route.ts` — `can('insumo.write')`
- `app/api/farms/[id]/insumos/[iid]/route.ts` — `can('insumo.write')`
- `app/api/farms/[id]/insumos/[iid]/stock/route.ts` — `can('transaction.entrada')`
- `app/api/farms/[id]/talhoes/route.ts` — `can('talhao.write')`
- `app/api/farms/[id]/talhoes/[tid]/route.ts` — `can('talhao.write')`
- `app/api/farms/[id]/implement-adjustments/route.ts` — `can('adjustment.write')`
- `app/api/farms/[id]/implement-adjustments/[adjId]/route.ts` — idem
- `app/api/farms/[id]/transactions/[tid]/route.ts` — `can('transaction.edit')`
- `app/api/analise/report/route.ts` — `can('analysis.export')`
- `app/api/farms/[id]/claim/route.ts` — `can('farm.edit')` (claim é editar dono)
- `components/Sidebar.tsx` — visibilidade de itens + label do cargo
- `components/UserEditor.tsx` — select com 3 cargos + lista de fazendas do tenant
- `app/(app)/admin/users/page.tsx` — query por `gestor_id` + badge de cargo
- `app/(app)/admin/users/new/page.tsx` — select com 3 cargos
- `app/(app)/admin/users/[uid]/page.tsx` — buscar fazendas do tenant para passar ao UserEditor
- `components/DeleteFarmButton.tsx` — esconder se `!can(role, 'farm.delete')`
- `components/FarmTabs.tsx` — label "aplicados" nas % de talhões (desktop + mobile)

---

## Task 1: Migration — schema + backfill

**Files:**
- Create: `supabase/migrations/20260527000005_user_roles_hierarchy.sql`

- [ ] **Step 1: Criar arquivo de migration**

Conteúdo completo:

```sql
-- Migration: Hierarquia de cargos (4) + multi-tenant por gestor_id
--
-- PROBLEMA: modelo atual binário admin/operario não suporta delegação
-- (Agrônomo, Admin como mão-direita do Gestor) e a tela de gestão de usuários
-- permite vincular um usuário a fazendas de OUTRO admin (cross-tenant leak).
--
-- SOLUÇÃO:
-- 1. Estender role enum: gestor, admin, agronomo, operario
-- 2. Nova coluna users.gestor_id NOT NULL apontando para o Gestor do tenant
--    (Gestor aponta para si próprio). Todas as queries de listagem de usuários
--    e vinculação de fazendas filtram por gestor_id = session.gestor_id.
-- 3. Backfill: cada admin atual vira gestor (gestor_id = self.id).
--    Operários herdam o gestor_id do created_by (que era admin, agora gestor).
-- 4. token_version bump global → força relogin → todos pegam JWT novo com gestor_id.
--
-- Idempotente: usa IF NOT EXISTS / IF EXISTS / CHECK substituível.

-- ── 1. CHECK constraint substituído (drop antigo, add novo) ─────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('gestor','admin','agronomo','operario'));

-- ── 2. Coluna gestor_id (nullable inicialmente para backfill) ───────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES users(id);

COMMENT ON COLUMN users.gestor_id IS
  'Raiz do tenant. Gestor aponta para si proprio; demais cargos para o Gestor do tenant.';

-- ── 3. Backfill: admins atuais viram gestores ───────────────────────────────
UPDATE users
SET role = 'gestor',
    gestor_id = id
WHERE role = 'admin';

-- ── 4. Backfill: demais users herdam gestor_id do created_by (agora gestor) ─
-- Fallback final: admin@stockdan.com (caso created_by NULL ou orfão)
UPDATE users u
SET gestor_id = COALESCE(
  (SELECT id FROM users WHERE id = u.created_by AND role = 'gestor'),
  (SELECT id FROM users WHERE email = 'admin@stockdan.com' AND role = 'gestor' LIMIT 1)
)
WHERE u.gestor_id IS NULL;

-- ── 5. Promover gestor_id para NOT NULL (após backfill) ─────────────────────
-- Se algum gestor_id permaneceu NULL, isto vai falhar — sinal de seed inconsistente
ALTER TABLE users ALTER COLUMN gestor_id SET NOT NULL;

-- ── 6. Index para queries por tenant ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_gestor_id ON users(gestor_id);

-- ── 7. Bump token_version global → força relogin de TODOS ───────────────────
-- Razão: JWTs antigos não têm gestor_id; precisam ser reissued pelo /login
UPDATE users SET token_version = token_version + 1;
```

- [ ] **Step 2: Aplicar migration via node-postgres (idêntico ao padrão usado em sessão anterior)**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && node -e "
const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260527000005_user_roles_hierarchy.sql', 'utf8');
const client = new Client({ connectionString: 'postgresql://postgres.omvsgnywqxviedksgpcr:Stylenote123W%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres', ssl: { rejectUnauthorized: false } });
client.connect()
  .then(() => client.query(sql))
  .then(r => { console.log('OK migration applied'); return client.end(); })
  .catch(e => { console.error('ERR:', e.message); client.end(); });
"
```

Expected output: `OK migration applied`. Se erro, ler mensagem e corrigir SQL antes de prosseguir.

- [ ] **Step 3: Verificar via query**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.omvsgnywqxviedksgpcr:Stylenote123W%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres', ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query(\`SELECT email, role, gestor_id, id FROM users ORDER BY role, email\`))
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); return c.end(); });
"
```

Expected: todo user com `gestor_id` não-nulo; admins originais com `role='gestor'` e `gestor_id === id`; operários com `gestor_id` apontando para algum gestor.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add supabase/migrations/20260527000005_user_roles_hierarchy.sql && git commit -m "feat(db): migration de 4 cargos + multi-tenant por gestor_id

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

⚠️ **NÃO faça push neste momento.** O código ainda lê role e Session sem `gestor_id`. Push só no final, quando código + DB estiverem alinhados.

---

## Task 2: lib/permissions.ts (capability matrix)

**Files:**
- Create: `lib/permissions.ts`

- [ ] **Step 1: Criar arquivo com matriz completa**

```ts
// lib/permissions.ts
//
// Fonte única de verdade para permissões. NUNCA compare role === 'admin'
// em route handlers ou componentes — use can(role, action).
//
// Padrão P9 (DEVELOPMENT-STANDARDS.md).

export type Role = 'gestor' | 'admin' | 'agronomo' | 'operario'

export type Action =
  | 'farm.create'
  | 'farm.edit'
  | 'farm.delete'
  | 'talhao.write'
  | 'insumo.write'
  | 'adjustment.write'
  | 'transaction.entrada'
  | 'transaction.saida'
  | 'transaction.edit'
  | 'user.list'
  | 'user.create'
  | 'user.edit'
  | 'user.delete'
  | 'analysis.view'
  | 'analysis.export'

const MATRIX: Record<Action, ReadonlyArray<Role>> = {
  'farm.create':         ['gestor', 'admin'],
  'farm.edit':           ['gestor', 'admin', 'agronomo'],
  'farm.delete':         ['gestor', 'admin'],
  'talhao.write':        ['gestor', 'admin', 'agronomo'],
  'insumo.write':        ['gestor', 'admin', 'agronomo'],
  'adjustment.write':    ['gestor', 'admin', 'agronomo'],
  'transaction.entrada': ['gestor', 'admin', 'agronomo'],
  'transaction.saida':   ['gestor', 'admin', 'agronomo', 'operario'],
  'transaction.edit':    ['gestor', 'admin', 'agronomo'],
  'user.list':           ['gestor', 'admin'],
  'user.create':         ['gestor', 'admin'],
  'user.edit':           ['gestor', 'admin'],
  'user.delete':         ['gestor', 'admin'],
  'analysis.view':       ['gestor', 'admin', 'agronomo'],
  'analysis.export':     ['gestor', 'admin', 'agronomo'],
}

/** Retorna true se o cargo `role` pode executar `action`. */
export function can(role: Role | string | null | undefined, action: Action): boolean {
  if (!role) return false
  const allowed = MATRIX[action]
  if (!allowed) return false
  return (allowed as ReadonlyArray<string>).includes(role)
}

/**
 * Pode `actor` gerenciar (criar/editar/excluir) o usuário `target`?
 *
 * Regras:
 * - Gestor pode mexer em qualquer um do seu tenant (verificação de tenant
 *   é feita separadamente via gestor_id).
 * - Admin pode mexer em todos EXCETO Gestor.
 * - Agrônomo e Operário não gerenciam usuários.
 */
export function canManageUser(actor: Role | string | null | undefined, target: Role | string): boolean {
  if (actor === 'gestor') return true
  if (actor === 'admin') return target !== 'gestor'
  return false
}

/**
 * Label legível em PT-BR. Centralizado para evitar inconsistências entre
 * Sidebar, badges, dropdowns, etc.
 */
export function roleLabel(role: Role | string): string {
  switch (role) {
    case 'gestor':   return 'Gestor'
    case 'admin':    return 'Administrador'
    case 'agronomo': return 'Agrônomo'
    case 'operario': return 'Operador'
    default:         return role
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit
```

Expected: exit 0 (sem erros).

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add lib/permissions.ts && git commit -m "feat(permissions): capability matrix + role labels (P9)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: lib/auth.ts — adicionar gestor_id na Session

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Ler arquivo e identificar interface Session e payload do JWT**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat lib/auth.ts
```

Expected: o arquivo define `interface Session { id, name, email, role, tv, mustChangePassword? }` e função `signSession(payload)` que faz `new SignJWT(payload)`.

- [ ] **Step 2: Editar Session interface adicionando gestor_id e tipando role**

No topo do arquivo, importar `Role`:

```ts
import type { Role } from './permissions'
```

Substituir a interface `Session`:

```ts
export interface Session {
  id: string
  name: string
  email: string
  role: Role
  gestor_id: string
  tv: number
  mustChangePassword?: boolean
}
```

- [ ] **Step 3: Atualizar `verifyToken` / `verifyTokenStrict` / `getSession` / `getActiveSession` para retornar `gestor_id`**

Identificar o local onde o payload do JWT é convertido em Session e garantir que `gestor_id` seja propagado. Se o código atual faz `return { id: payload.sub, name: payload.name, email: payload.email, role: payload.role, tv: payload.tv }`, mudar para incluir `gestor_id: payload.gestor_id as string`.

- [ ] **Step 4: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | head -50
```

Vão aparecer MUITOS erros (todas as rotas que constroem Session). Isso é esperado — vamos corrigir nos próximos passos. Anotar os arquivos que faltam.

- [ ] **Step 5: Commit (mesmo com erros TSC pendentes — vamos corrigir nas próximas tasks)**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add lib/auth.ts && git commit -m "feat(auth): Session.gestor_id + Role type (P8 setup)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Routes de login + refresh emitem gestor_id no JWT

**Files:**
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/refresh/route.ts`

- [ ] **Step 1: Ler login route**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat app/api/auth/login/route.ts
```

Localizar o `select` que busca o user e a chamada `signSession({ ... })`.

- [ ] **Step 2: Editar login/route.ts — incluir gestor_id no select e no payload**

Mudar o `select(...)` para incluir `gestor_id`:

```ts
const { data: user } = await supabase
  .from('users')
  .select('id, name, email, role, gestor_id, password_hash, must_change_password, token_version')
  .eq('email', email.toLowerCase().trim())
  .maybeSingle()
```

E o `signSession` (ou equivalente) ganha `gestor_id: user.gestor_id`:

```ts
const token = await signSession({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  gestor_id: user.gestor_id,
  tv: user.token_version,
  mustChangePassword: user.must_change_password,
})
```

- [ ] **Step 3: Editar refresh/route.ts — mesma mudança**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat app/api/auth/refresh/route.ts
```

Mudar select + payload do JWT para incluir `gestor_id` igual ao login.

- [ ] **Step 4: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep -E "(login|refresh|auth)" | head -20
```

Expected: nenhum erro nestes 2 arquivos. Erros em outras rotas (que ainda usam Session sem gestor_id) são esperados.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add app/api/auth/login/route.ts app/api/auth/refresh/route.ts && git commit -m "feat(auth): login e refresh emitem gestor_id no JWT

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: lib/farmAccess.ts — refatorar para usar gestor_id (defesa em profundidade)

**Files:**
- Modify: `lib/farmAccess.ts`

- [ ] **Step 1: Ler implementação atual**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat lib/farmAccess.ts
```

- [ ] **Step 2: Substituir checkFarmAccess pela versão nova**

A regra: Gestor é dono direto (`farms.owner_id = session.id`); demais cargos precisam de `farm_users` E a fazenda precisa pertencer ao seu tenant (`farms.owner_id = session.gestor_id`).

```ts
// lib/farmAccess.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Session } from './auth'

/**
 * Retorna true se a session tem acesso a esta fazenda.
 *
 * P7 + P8:
 * - Gestor: dono direto (owner_id = session.id)
 * - Admin / Agrônomo / Operário: precisa de farm_users (user_id=session.id)
 *   E a fazenda tem que pertencer ao Gestor do tenant (owner_id = session.gestor_id).
 *   Defesa em profundidade: bloqueia mesmo que alguém manipule farm_users.
 */
export async function checkFarmAccess(
  supabase: SupabaseClient,
  session: Session,
  farmId: string
): Promise<boolean> {
  if (session.role === 'gestor') {
    const { data } = await supabase
      .from('farms')
      .select('id')
      .eq('id', farmId)
      .eq('owner_id', session.id)
      .maybeSingle()
    return !!data
  }

  // Join farm_users → farms, filtrando por tenant
  const { data } = await supabase
    .from('farm_users')
    .select('farm_id, farms!inner(owner_id)')
    .eq('user_id', session.id)
    .eq('farm_id', farmId)
    .eq('farms.owner_id', session.gestor_id)
    .maybeSingle()
  return !!data
}
```

- [ ] **Step 3: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep "farmAccess"
```

Expected: sem erros em farmAccess.ts.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add lib/farmAccess.ts && git commit -m "refactor(access): checkFarmAccess usa gestor_id (P7 + P8)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: app/api/users/route.ts — list/create com tenant + capability

**Files:**
- Modify: `app/api/users/route.ts`

- [ ] **Step 1: Ler arquivo**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat app/api/users/route.ts
```

- [ ] **Step 2: Atualizar GET (listar usuários do tenant)**

Substituir o handler GET. Pontos críticos:
- `can(session.role, 'user.list')` no início
- Query filtra por `gestor_id = session.gestor_id` (NÃO por `created_by`)
- Exclui o próprio user (`neq('id', session.id)`)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can, canManageUser, type Role } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.list')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password, created_at')
    .eq('gestor_id', session.gestor_id)
    .neq('id', session.id)
    .order('name')

  if (error) {
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 3: Atualizar POST (criar user) com capability + tenant**

Adicionar no mesmo arquivo (substituir POST atual):

```ts
const VALID_NEW_ROLES: ReadonlyArray<Role> = ['admin', 'agronomo', 'operario']

export async function POST(req: NextRequest) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.create')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const { name, email, password, role } = body as { name?: string; email?: string; password?: string; role?: string }

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Nome, e-mail, senha e cargo são obrigatórios.' }, { status: 400 })
  }
  if (!VALID_NEW_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })
  }
  if (!canManageUser(session.role, role as Role)) {
    return NextResponse.json({ error: 'Sem permissão para este cargo.' }, { status: 403 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabase
    .from('users')
    .insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      role,
      gestor_id: session.gestor_id,    // P8: herda tenant do criador
      created_by: session.id,
      must_change_password: true,
      token_version: 0,
    })
    .select('id, name, email, role')
    .single()

  if (error) {
    // 23505 = unique violation (email duplicado)
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep "api/users/route"
```

Expected: sem erros neste arquivo.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add app/api/users/route.ts && git commit -m "feat(users): GET/POST com capability + tenant isolation (P8/P9)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: app/api/users/[uid]/route.ts — PATCH/DELETE com tenant + farm_ids validation

**Files:**
- Modify: `app/api/users/[uid]/route.ts`

- [ ] **Step 1: Ler arquivo**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat "app/api/users/[uid]/route.ts"
```

- [ ] **Step 2: Substituir PATCH handler**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getActiveSession, invalidateTokenVersionCache } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can, canManageUser, type Role } from '@/lib/permissions'
import { parseBody } from '@/lib/utils'
import { isUUID } from '@/lib/validate'

type Params = { params: Promise<{ uid: string }> }

const VALID_EDIT_ROLES: ReadonlyArray<Role> = ['admin', 'agronomo', 'operario']

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.edit')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { uid } = await params
  if (!isUUID(uid)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const supabase = createServerClient()

  // P8: validar target no mesmo tenant
  const { data: target } = await supabase
    .from('users')
    .select('id, role, gestor_id, token_version')
    .eq('id', uid)
    .maybeSingle()

  if (!target || target.gestor_id !== session.gestor_id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  if (!canManageUser(session.role, target.role)) {
    return NextResponse.json({ error: 'Sem permissão para este usuário.' }, { status: 403 })
  }

  // Preparar updates
  const updates: Record<string, unknown> = {}
  let roleChanged = false

  if (typeof body.name === 'string') updates.name = body.name.trim()

  if (typeof body.role === 'string' && body.role !== target.role) {
    if (!VALID_EDIT_ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 })
    }
    if (!canManageUser(session.role, body.role as Role)) {
      return NextResponse.json({ error: 'Sem permissão para este cargo.' }, { status: 403 })
    }
    updates.role = body.role
    updates.token_version = (target.token_version ?? 0) + 1  // P5
    roleChanged = true
  }

  // P8: farm_ids — todas têm que ser do tenant
  let farm_ids: string[] | null = null
  if (Array.isArray(body.farm_ids)) {
    if (!body.farm_ids.every((id: unknown) => typeof id === 'string' && isUUID(id))) {
      return NextResponse.json({ error: 'farm_ids inválido.' }, { status: 400 })
    }
    farm_ids = body.farm_ids as string[]
    if (farm_ids.length > 0) {
      const { data: owned } = await supabase
        .from('farms')
        .select('id')
        .eq('owner_id', session.gestor_id)
        .in('id', farm_ids)
      if ((owned?.length ?? 0) !== farm_ids.length) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
      }
    }
  }

  // Aplicar updates do user
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('users').update(updates).eq('id', uid)
    if (error) {
      return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    }
    if (roleChanged) invalidateTokenVersionCache(uid)
  }

  // Aplicar farm_users (substitui set completo)
  if (farm_ids !== null) {
    const { error: delErr } = await supabase.from('farm_users').delete().eq('user_id', uid)
    if (delErr) {
      return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
    }
    if (farm_ids.length > 0) {
      const rows = farm_ids.map((fid) => ({ user_id: uid, farm_id: fid }))
      const { error: insErr } = await supabase.from('farm_users').insert(rows)
      if (insErr) {
        return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getActiveSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!can(session.role, 'user.delete')) {
    return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
  }

  const { uid } = await params
  if (!isUUID(uid)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }
  if (uid === session.id) {
    return NextResponse.json({ error: 'Não é possível excluir o próprio usuário.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: target } = await supabase
    .from('users')
    .select('id, role, gestor_id')
    .eq('id', uid)
    .maybeSingle()

  if (!target || target.gestor_id !== session.gestor_id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  if (!canManageUser(session.role, target.role)) {
    return NextResponse.json({ error: 'Sem permissão para este usuário.' }, { status: 403 })
  }

  const { error } = await supabase.from('users').delete().eq('id', uid)
  if (error) {
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
  invalidateTokenVersionCache(uid)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep "api/users"
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add "app/api/users/[uid]/route.ts" && git commit -m "fix(users): PATCH/DELETE com tenant + farm_ids validation (corrige cross-tenant leak)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Migrar todas as routes de farms/insumos/talhoes/adjustments para can()

**Files:**
- Modify: `app/api/farms/route.ts`
- Modify: `app/api/farms/[id]/route.ts`
- Modify: `app/api/farms/[id]/claim/route.ts`
- Modify: `app/api/farms/[id]/insumos/route.ts`
- Modify: `app/api/farms/[id]/insumos/[iid]/route.ts`
- Modify: `app/api/farms/[id]/insumos/[iid]/stock/route.ts`
- Modify: `app/api/farms/[id]/talhoes/route.ts`
- Modify: `app/api/farms/[id]/talhoes/[tid]/route.ts`
- Modify: `app/api/farms/[id]/implement-adjustments/route.ts`
- Modify: `app/api/farms/[id]/implement-adjustments/[adjId]/route.ts`
- Modify: `app/api/farms/[id]/transactions/[tid]/route.ts`
- Modify: `app/api/analise/report/route.ts`

- [ ] **Step 1: Encontrar todas as ocorrências de role check direto**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && grep -rn "session\.role" app/api --include="*.ts"
```

Listar resultado e mapear cada ocorrência para uma action.

- [ ] **Step 2: Substituir em cada arquivo conforme a tabela**

Para cada arquivo, importar `can` e substituir.

**Ex (`app/api/farms/route.ts`, handler POST):**

ANTES:
```ts
if (session.role !== 'admin') {
  return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
}
```

DEPOIS:
```ts
import { can } from '@/lib/permissions'
// ...
if (!can(session.role, 'farm.create')) {
  return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
}
```

Mapping completo:

| Arquivo | Handler | Action |
|---|---|---|
| `app/api/farms/route.ts` | POST | `farm.create` |
| `app/api/farms/[id]/route.ts` | PATCH | `farm.edit` |
| `app/api/farms/[id]/route.ts` | DELETE | `farm.delete` |
| `app/api/farms/[id]/claim/route.ts` | POST | `farm.edit` |
| `app/api/farms/[id]/insumos/route.ts` | POST | `insumo.write` |
| `app/api/farms/[id]/insumos/[iid]/route.ts` | PATCH | `insumo.write` |
| `app/api/farms/[id]/insumos/[iid]/route.ts` | DELETE | `insumo.write` |
| `app/api/farms/[id]/insumos/[iid]/stock/route.ts` | POST | `transaction.entrada` |
| `app/api/farms/[id]/talhoes/route.ts` | POST | `talhao.write` |
| `app/api/farms/[id]/talhoes/[tid]/route.ts` | PATCH/PUT | `talhao.write` |
| `app/api/farms/[id]/talhoes/[tid]/route.ts` | DELETE | `talhao.write` |
| `app/api/farms/[id]/implement-adjustments/route.ts` | POST | `adjustment.write` |
| `app/api/farms/[id]/implement-adjustments/[adjId]/route.ts` | PATCH | `adjustment.write` |
| `app/api/farms/[id]/implement-adjustments/[adjId]/route.ts` | DELETE | `adjustment.write` |
| `app/api/farms/[id]/transactions/[tid]/route.ts` | PATCH | `transaction.edit` |
| `app/api/farms/[id]/transactions/[tid]/route.ts` | DELETE | `transaction.edit` |
| `app/api/analise/report/route.ts` | POST/GET (qual existir) | `analysis.export` |

`POST /api/farms/[id]/transactions` (criar retirada) NÃO precisa de mudança porque já é aberto para operário (já é a action `transaction.saida` que aceita todos).

- [ ] **Step 3: Type-check + verificar que nenhum role check direto sobrou**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit && grep -rn "session\.role !== " app/api --include="*.ts" && grep -rn "session\.role ===" app/api --include="*.ts"
```

Expected:
- TSC: exit 0
- Os 2 greps devem retornar `exit 1` (nenhum match) — todas as comparações migraram para `can()`

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add app/api && git commit -m "refactor(api): substituir role === 'admin' por can() em todas as routes (P9)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Sidebar — visibilidade por cargo + label correto

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Atualizar import e condição de "Gestão"**

No topo:

```tsx
import { can, roleLabel, type Role } from '@/lib/permissions'
```

Tipar prop `role`:

```tsx
interface SidebarProps {
  role: Role
  userName: string
  isOpen?: boolean
  onClose?: () => void
}
```

Substituir o trecho `{role === 'admin' && (...)}` (seção "Gestão") por:

```tsx
{(can(role, 'user.list') || can(role, 'farm.create')) && (
  <>
    <p className="mt-5 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
      Gestão
    </p>
    {can(role, 'farm.create') && (
      <NavItem
        href="/farms"
        active={isActive('/farms')}
        onClick={onClose}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
          </svg>
        }
        label="Fazendas"
      />
    )}
    {can(role, 'user.list') && (
      <NavItem
        href="/admin/users"
        active={isActive('/admin')}
        onClick={onClose}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        }
        label="Usuários"
      />
    )}
  </>
)}
```

- [ ] **Step 2: Substituir label do perfil**

Trocar:

```tsx
<p className="text-xs text-gray-500">{role === 'admin' ? 'Administrador' : 'Operador'}</p>
```

Por:

```tsx
<p className="text-xs text-gray-500">{roleLabel(role)}</p>
```

- [ ] **Step 3: Onde Sidebar é instanciada, garantir que role chega como Role**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && grep -rn "<Sidebar" components app
```

O AppShell já passa role; se houver erro de tipo, alinhar.

- [ ] **Step 4: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep -E "(Sidebar|AppShell)"
```

Expected: sem erros (ou apenas erros de propagação do tipo Role que devem ser corrigidos imediatamente).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add components/Sidebar.tsx components/AppShell.tsx && git commit -m "feat(sidebar): visibilidade por capability + roleLabel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: UserEditor + pages de users — 4 cargos + fazendas do tenant

**Files:**
- Modify: `components/UserEditor.tsx`
- Modify: `app/(app)/admin/users/page.tsx`
- Modify: `app/(app)/admin/users/new/page.tsx`
- Modify: `app/(app)/admin/users/[uid]/page.tsx`

- [ ] **Step 1: Ler todos os 4 arquivos para contexto**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat components/UserEditor.tsx "app/(app)/admin/users/[uid]/page.tsx" "app/(app)/admin/users/new/page.tsx"
```

- [ ] **Step 2: Editar UserEditor — select de cargo com 3 opções + labels**

No componente:

```tsx
import { roleLabel, canManageUser, type Role } from '@/lib/permissions'

// Onde tem o select de role, usar 3 opções:
const ROLES_FOR_NEW: Role[] = ['admin', 'agronomo', 'operario']

// No JSX:
<select value={role} onChange={e => setRole(e.target.value as Role)} ...>
  {ROLES_FOR_NEW.map(r => (
    <option key={r} value={r}>{roleLabel(r)}</option>
  ))}
</select>
```

(Adaptar à estrutura exata do componente. Se já tem 2 opções hardcoded, substituir pelo map acima.)

A lista de fazendas que o componente recebe via prop já vem filtrada do servidor (próximo step).

- [ ] **Step 3: Editar `[uid]/page.tsx` — buscar fazendas do tenant**

A página passa as fazendas para UserEditor. Garantir que o select de farms list é filtrado por gestor:

```tsx
const supabase = createServerClient()
const { data: farms } = await supabase
  .from('farms')
  .select('id, name')
  .eq('owner_id', session.gestor_id)   // P8
  .order('name')
```

(Substituir qualquer query atual que NÃO filtra por owner.)

- [ ] **Step 4: Editar `page.tsx` (lista) — query por gestor_id + badge de role**

Substituir:
```tsx
.eq('created_by', session.id)
```

Por:
```tsx
.eq('gestor_id', session.gestor_id)
.neq('id', session.id)
```

E nos badges (mobile e desktop), atualizar o switch:

```tsx
import { roleLabel } from '@/lib/permissions'

const roleBadge = (role: string) => {
  switch (role) {
    case 'gestor':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-400'
    case 'admin':
      return 'border-green-500/20 bg-green-500/10 text-green-400'
    case 'agronomo':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-400'
    default:
      return 'border-gray-700 bg-gray-800 text-gray-400'
  }
}

// No JSX, substituir o conteúdo do span de role:
<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadge(user.role)}`}>
  {roleLabel(user.role)}
</span>
```

- [ ] **Step 5: Editar `new/page.tsx` — form com 3 cargos**

Mesmo padrão do UserEditor: select com 3 opções via `ROLES_FOR_NEW.map(r => <option ...>{roleLabel(r)}</option>)`.

- [ ] **Step 6: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep -E "(UserEditor|admin/users)"
```

Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add components/UserEditor.tsx "app/(app)/admin/users" && git commit -m "feat(users-ui): 4 cargos no editor + listagem por tenant + badges

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: DeleteFarmButton + outros guards de UI

**Files:**
- Modify: `components/DeleteFarmButton.tsx`
- Modify: `app/(app)/farms/[id]/page.tsx` (botões "Editar"/"Excluir" e ações por cargo)
- Modify: `components/FarmTabs.tsx` (botões de admin)

- [ ] **Step 1: DeleteFarmButton aceita role e esconde se sem permissão**

Se o componente já recebe `userRole` via prop, adicionar guard. Se não recebe, fazê-lo receber:

```tsx
import { can, type Role } from '@/lib/permissions'

interface Props {
  farmId: string
  farmName: string
  userRole: Role  // adicionar prop se não existir
}

export function DeleteFarmButton({ farmId, farmName, userRole }: Props) {
  if (!can(userRole, 'farm.delete')) return null
  // ... resto igual ...
}
```

No `app/(app)/farms/[id]/page.tsx`, onde o DeleteFarmButton é usado, passar `userRole={session.role}`.

- [ ] **Step 2: No mesmo `farms/[id]/page.tsx`, substituir `session.role === 'admin'` por can()**

```tsx
import { can } from '@/lib/permissions'

// Botão Editar fazenda:
{can(session.role, 'farm.edit') && (<Link href={...}>...</Link>)}

// Botão Excluir (já dentro do DeleteFarmButton via guard interno, mas wrapper antigo se houver):
{can(session.role, 'farm.delete') && (<DeleteFarmButton .../>)}
```

- [ ] **Step 3: FarmTabs — esconder botões admin para quem não pode**

Identificar os trechos `{userRole === 'admin' && ...}` em FarmTabs.tsx e substituir:

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && grep -n "userRole === 'admin'" components/FarmTabs.tsx
```

Para cada match, mapear para a capability correta:

- "Gerenciar Talhões" → `can(userRole, 'talhao.write')`
- "Novo Insumo" → `can(userRole, 'insumo.write')`
- Botão Editar/Excluir insumo → `can(userRole, 'insumo.write')`
- "+ Aplicação" continua para todos (já é o caso)
- "+ Regulagem" → `can(userRole, 'adjustment.write')`
- "Detalhes do talhão" → todos (já é o caso)
- Excluir talhão → `can(userRole, 'talhao.write')`

Também tipar `userRole: Role` na interface props.

- [ ] **Step 4: Type-check**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit 2>&1 | grep -E "(DeleteFarmButton|FarmTabs|farms/\[id\]/page)"
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add components/DeleteFarmButton.tsx components/FarmTabs.tsx "app/(app)/farms/[id]/page.tsx" && git commit -m "feat(ui): guards de botões por capability (DeleteFarm, FarmTabs admin actions)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: FarmTabs — label "aplicados" no % de talhões

**Files:**
- Modify: `components/FarmTabs.tsx`

- [ ] **Step 1: Encontrar onde a % é renderizada**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && grep -n "%" components/FarmTabs.tsx | head -30
```

Identificar as 2 ocorrências (TalhaoRow desktop + TalhaoCard mobile) onde é renderizado o valor percentual.

- [ ] **Step 2: Adicionar " aplicados" no template string da % (desktop)**

Localizar onde está algo como `{pct.toFixed(0)}%` ou `${pct}%` e substituir por:

```tsx
{pct.toFixed(0)}% aplicados
```

Cuidado: se o valor renderizado está num espaço apertado (célula de tabela), a palavra "aplicados" pode quebrar. Adicionar `whitespace-nowrap` no span pai se necessário. Se ficar visualmente ruim, considerar a abreviação `aplic.` no desktop e `aplicados` no mobile — mas o usuário pediu "aplicados", então manter a palavra cheia.

- [ ] **Step 3: Mesma mudança no TalhaoCard (mobile)**

Localizar e atualizar a renderização análoga no componente do card.

- [ ] **Step 4: Build local para verificar layout não quebra**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx tsc --noEmit
```

Expected: exit 0. (Verificação visual real só pós-deploy.)

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add components/FarmTabs.tsx && git commit -m "feat(ui): label 'aplicados' no percentual de talhões (desktop + mobile)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: Build final + push + deploy + manual smoke test

**Files:** todos os commits anteriores

- [ ] **Step 1: Build local completo**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` + listagem de rotas, sem erros.

Se falhar: ler erro, voltar e corrigir. NÃO seguir.

- [ ] **Step 2: Push para origin**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git push origin master
```

- [ ] **Step 3: Deploy Vercel prod**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx vercel --prod --yes 2>&1 | tail -10
```

Expected: `Deployment ... ready.` no JSON de saída.

- [ ] **Step 4: Verificar deployment status**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && npx vercel ls --prod 2>&1 | head -5
```

Expected: `● Ready` no deploy mais recente. Se `● Error`: investigar com `npx vercel logs URL`.

- [ ] **Step 5: Smoke test manual (curl)**

Login como `admin@stockdan.com` (agora gestor):

```bash
curl -s -c /tmp/c.txt -X POST https://stockdan.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stockdan.com","password":"<SENHA>"}'
```

Expected: 200 com `{ok: true}`. Cookie auth_token gravado.

Listar users:

```bash
curl -s -b /tmp/c.txt https://stockdan.vercel.app/api/users
```

Expected: 200 com array (vazio ou com usuários do tenant).

Tentar criar Gestor via API (deve falhar):

```bash
curl -s -b /tmp/c.txt -X POST https://stockdan.vercel.app/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Hack","email":"h@h.com","password":"123456","role":"gestor"}'
```

Expected: 400 `{"error":"Cargo inválido."}`.

- [ ] **Step 6: Smoke test manual (UI)**

No browser:
1. Login com admin antigo → entra no dashboard normalmente
2. Sidebar mostra label "Gestor" no perfil
3. Ir em /admin/users → lista vazia (ou só os usuários que ele criou)
4. Criar novo Agrônomo via "Novo Usuário" → select tem 3 opções (Admin, Agrônomo, Operário)
5. Voltar pra lista → novo Agrônomo aparece com badge azul
6. Ir em /admin/users/[id-do-agronomo] → editor mostra checkboxes só das fazendas do Gestor
7. Vincular o Agrônomo a uma fazenda → salvar → ok
8. Tentar via Network DevTools: fazer PATCH em /api/users/[uid] com farm_ids contendo um UUID aleatório (ex: zerado) → expected 403
9. Logout
10. Login como Agrônomo recém-criado (senha temp informada) → trocar senha → entra
11. Ver Sidebar: NÃO tem "Usuários" (Agrônomo não vê)
12. Entrar na fazenda vinculada → ver tabela de talhões: % aparece como "55% aplicados"
13. Tentar excluir fazenda → botão NÃO aparece
14. Conseguir registrar retirada normalmente
15. Logout e login como Operário → idem mas tudo bloqueado exceto retiradas

Cada item: anotar pass/fail. Se algum fail: documentar para fix posterior, mas não bloquear o "feito" do plano se for cosmético.

- [ ] **Step 7: Atualizar CLAUDE.md com nota da mudança (parte da disciplina P-update)**

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && cat CLAUDE.md | head -10
```

Adicionar no final do arquivo, na seção de "Padrões":

```markdown

## Hierarquia de Cargos (desde 2026-05-27)

4 cargos: `gestor`, `admin`, `agronomo`, `operario`.
- Gestor: dono da fazenda, raiz do tenant
- Admin: mão-direita do Gestor (cria users, gerencia fazendas, exceto deletar Gestor)
- Agrônomo: opera tudo do dia-a-dia, sem deletar fazenda nem criar users
- Operário: apenas registra retiradas

Toda checagem: `can(role, 'namespace.action')` de `lib/permissions.ts`.
Toda query de tenant: `WHERE gestor_id = session.gestor_id` (P8).
```

Commit:

```bash
cd C:/Users/Orismar/Documents/StockDan/stockdan-app && git add CLAUDE.md && git commit -m "docs: nota da hierarquia de cargos no CLAUDE.md" && git push
```

---

## Verificação final

Spec coverage:
- ✓ 4 cargos definidos e ativos (Task 1 + 2)
- ✓ Multi-tenant por gestor_id em DB (Task 1) + Session (Task 3) + farmAccess (Task 5) + users API (Tasks 6, 7)
- ✓ Capability check substitui role string em todo handler (Task 8) e UI (Tasks 9, 10, 11)
- ✓ Migração de admins atuais para gestor (Task 1, step SQL UPDATE)
- ✓ Bug de cross-tenant em farm_users corrigido (Task 7 + Task 10 query do editor)
- ✓ Token version bump força relogin (Task 1, step SQL final + Task 7 em mudanças de role)
- ✓ Label "aplicados" no % de talhões (Task 12)
- ✓ Sidebar sem opções proibidas (Task 9)
- ✓ DeleteFarmButton oculto para Agrônomo/Operário (Task 11)
- ✓ Smoke test cobre cada cenário do "Testing manual checklist" da spec (Task 13, step 6)
- ✓ Standards (DEVELOPMENT-STANDARDS.md) atualizado com P8/P9 (feito antes do plano, no commit f9c4a17)
