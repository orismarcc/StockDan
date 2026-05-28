# Hierarquia de Cargos + Isolamento Multi-tenant — Design Spec

> **Aderência obrigatória:** todos os padrões de `docs/DEVELOPMENT-STANDARDS.md` (P1–P9).
> Esta spec introduz P8 (multi-tenant por Gestor) e P9 (capability matrix). Após
> aprovação, esses padrões serão registrados no STANDARDS para futuras tasks.

---

## Goal

Substituir o modelo binário `admin/operario` por hierarquia de 4 cargos com
isolamento real entre Gestores (multi-tenant), corrigindo a vulnerabilidade
atual onde um Gestor consegue vincular seus usuários a fazendas de outro
Gestor — e adicionar label "aplicados" no % da tabela de talhões.

## Não-objetivos

- Não criar UI para self-signup de Gestor (continua via processo manual / admin@stockdan.com)
- Não migrar para Supabase Auth (mantém JWT custom)
- Não adicionar Row-Level Security do PostgreSQL nesta task (RLS é uma camada
  adicional futura; isolamento atual é feito no API layer, igual ao padrão atual)
- Não tocar em offline-first / mutationQueue (não há mudança no fluxo de campo)

---

## Arquitetura

### Modelo de cargos

| Cargo | Identificador | Origem |
|---|---|---|
| Gestor | `gestor` | Migrado dos `admin` atuais + criação manual via seed |
| Administrador | `admin` | Criado por Gestor ou outro Admin |
| Agrônomo | `agronomo` | Criado por Gestor ou Admin |
| Operário | `operario` | Criado por Gestor ou Admin |

### Tenancy por Gestor

- Cada usuário tem `gestor_id UUID NOT NULL REFERENCES users(id)`
- Gestor: `gestor_id = self.id` (auto-referência)
- Demais: `gestor_id` aponta para o Gestor do tenant
- Quando Admin cria usuário: novo `gestor_id` = `creator.gestor_id` (herda tenant)
- Fazendas: `owner_id` é sempre um Gestor — não muda

### Capability matrix (P9 novo)

| Ação | Gestor | Admin | Agrônomo | Operário |
|---|---|---|---|---|
| **Farms** |
| Listar fazendas vinculadas | ✓ | ✓ | ✓ | ✓ |
| Criar fazenda | ✓ | ✓ | ✗ | ✗ |
| Editar fazenda | ✓ | ✓ | ✓ | ✗ |
| Excluir fazenda | ✓ | ✓ | ✗ | ✗ |
| **Talhões / Insumos / Regulagens** |
| Criar/editar/excluir | ✓ | ✓ | ✓ | ✗ |
| **Transações** |
| Registrar retirada | ✓ | ✓ | ✓ | ✓ |
| Registrar entrada | ✓ | ✓ | ✓ | ✗ |
| Editar/excluir retirada | ✓ | ✓ | ✓ | ✗ |
| **Usuários** |
| Listar usuários do tenant | ✓ | ✓ | ✗ | ✗ |
| Criar usuário | ✓ | ✓ (não Gestor) | ✗ | ✗ |
| Editar/atribuir fazendas | ✓ | ✓ (não Gestor) | ✗ | ✗ |
| Excluir usuário | ✓ | ✓ (não Gestor) | ✗ | ✗ |
| **Análise / Relatórios** |
| Ver análise | ✓ | ✓ | ✓ | ✗ |
| Gerar PDF/Excel | ✓ | ✓ | ✓ | ✗ |

A função canônica `can(role, action)` em `lib/permissions.ts` é fonte única de verdade.

### Isolamento de fazendas (correção do bug)

**Regra única e simples** (escolha do usuário: linkar explicitamente todos):

- **Gestor**: acesso se `farms.owner_id = session.id`
- **Admin / Agrônomo / Operário**: acesso se existe `farm_users (user_id=session.id, farm_id=X)` E `farms.owner_id = session.gestor_id` (defesa em profundidade — bloqueia se alguém manipular `farm_users` para apontar fora do tenant)
- Tudo o mais: 403

Admin e Agrônomo seguem o mesmo modelo de Operário — precisam ser vinculados
em cada fazenda. Isso garante que o Gestor decide explicitamente onde cada
colaborador opera, mesmo que ele tenha permissões amplas no sistema.

### Migração de dados existentes

```
Antes:                          Depois:
─────                           ──────
admin@stockdan.com → admin       → gestor, gestor_id = self.id
outros admins → admin            → gestor, gestor_id = self.id
operarios → operario             → operario, gestor_id = created_by (era admin, agora gestor)
```

Casos críticos cobertos:
- `created_by IS NULL` em algum operário → gestor_id = primeiro Gestor (fallback: admin@stockdan.com)
- Admin sem operários: vira gestor sem subordinados
- `farms.owner_id`: já é o admin (agora gestor) — sem mudança

### Token version (P5 reuso)

Toda mudança de role/gestor_id incrementa `token_version` do usuário afetado +
invalida o cache. Isso garante que se você rebaixar um Admin para Operário, ele
perde acesso na próxima request (≤ 30s pelo cache).

---

## Mudanças por arquivo

### Database

**Migration `20260527000005_user_roles_hierarchy.sql`:**

```sql
-- 1. Drop CHECK antigo, add CHECK novo com 4 roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('gestor','admin','agronomo','operario'));

-- 2. Coluna gestor_id (nullable inicialmente; backfill; depois NOT NULL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES users(id);

-- 3. Backfill: admins viram gestores apontando para si mesmos
UPDATE users SET role = 'gestor', gestor_id = id WHERE role = 'admin';

-- 4. Backfill: operarios herdam gestor_id do created_by (agora gestor)
UPDATE users u SET gestor_id = COALESCE(
  (SELECT id FROM users WHERE id = u.created_by AND role = 'gestor'),
  (SELECT id FROM users WHERE email = 'admin@stockdan.com' LIMIT 1)
)
WHERE u.gestor_id IS NULL;

-- 5. Constraint final
ALTER TABLE users ALTER COLUMN gestor_id SET NOT NULL;

-- 6. Index para queries de tenant
CREATE INDEX IF NOT EXISTS idx_users_gestor_id ON users(gestor_id);

-- 7. Invalida sessões atuais (todos pegam novo JWT com gestor_id)
UPDATE users SET token_version = token_version + 1;

COMMENT ON COLUMN users.gestor_id IS
  'Raiz do tenant. Gestor aponta para si mesmo; demais cargos para o Gestor do seu tenant.';
```

### Backend

**`lib/permissions.ts` (NOVO):**

```ts
export type Role = 'gestor' | 'admin' | 'agronomo' | 'operario'

export type Action =
  | 'farm.create' | 'farm.edit' | 'farm.delete'
  | 'talhao.write' | 'insumo.write' | 'adjustment.write'
  | 'transaction.entrada' | 'transaction.saida' | 'transaction.edit'
  | 'user.list' | 'user.create' | 'user.edit' | 'user.delete'
  | 'analysis.view' | 'analysis.export'

const MATRIX: Record<Action, Role[]> = {
  'farm.create':         ['gestor','admin'],
  'farm.edit':           ['gestor','admin','agronomo'],
  'farm.delete':         ['gestor','admin'],
  'talhao.write':        ['gestor','admin','agronomo'],
  'insumo.write':        ['gestor','admin','agronomo'],
  'adjustment.write':    ['gestor','admin','agronomo'],
  'transaction.entrada': ['gestor','admin','agronomo'],
  'transaction.saida':   ['gestor','admin','agronomo','operario'],
  'transaction.edit':    ['gestor','admin','agronomo'],
  'user.list':           ['gestor','admin'],
  'user.create':         ['gestor','admin'],
  'user.edit':           ['gestor','admin'],
  'user.delete':         ['gestor','admin'],
  'analysis.view':       ['gestor','admin','agronomo'],
  'analysis.export':     ['gestor','admin','agronomo'],
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[action]?.includes(role) ?? false
}

/** Admin não pode deletar Gestor; só Gestor pode mexer em outro Gestor */
export function canManageUser(actor: Role, target: Role): boolean {
  if (actor === 'gestor') return true
  if (actor === 'admin') return target !== 'gestor'
  return false
}
```

**`lib/auth.ts` — Session ganha gestor_id:**

```ts
export interface Session {
  id: string
  name: string
  email: string
  role: Role
  gestor_id: string       // NOVO
  tv: number
  mustChangePassword?: boolean
}
```

- `login/route.ts`: lê `gestor_id` do DB e inclui no JWT
- `refresh/route.ts`: idem
- `verifyTokenStrict`: já compara `tv`, agora também devolve `gestor_id`

**`lib/farmAccess.ts` — Refatorar checkFarmAccess:**

```ts
export async function checkFarmAccess(
  supabase: SupabaseClient,
  session: Session,
  farmId: string
): Promise<boolean> {
  // Gestor: owner direto
  if (session.role === 'gestor') {
    const { data } = await supabase
      .from('farms').select('id')
      .eq('id', farmId).eq('owner_id', session.id).maybeSingle()
    return !!data
  }

  // Admin/Agrônomo/Operário: precisa estar em farm_users
  // E a fazenda precisa ser do seu Gestor (defesa em profundidade)
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

**`app/api/users/route.ts` (POST — criar):**

```ts
// 1. Verificar can(session.role, 'user.create')
// 2. Body: role tem que ser uma de ['admin','agronomo','operario'] (NUNCA gestor via API)
// 3. Validar canManageUser(session.role, body.role)
// 4. Inserir com gestor_id = session.gestor_id (herda tenant)
// 5. token_version inicia em 0
```

**`app/api/users/route.ts` (GET — listar):**

```ts
// Filtrar por gestor_id = session.gestor_id (não mais created_by)
// Garante que Admin vê todos os usuários do tenant, não só os que ele criou
.eq('gestor_id', session.gestor_id)
.neq('id', session.id)  // não lista o próprio
```

**`app/api/users/[uid]/route.ts` (PATCH/DELETE):**

```ts
// Buscar usuário-alvo
// Validar target.gestor_id === session.gestor_id (mesmo tenant)
// Validar canManageUser(session.role, target.role)
// Se PATCH muda role: incrementar target.token_version + invalidateTokenVersionCache
// Se DELETE de Gestor: bloquear (target.role === 'gestor' && session.role !== 'gestor')
//   E sempre bloquear delete de self
```

**Quando vincular fazendas ao usuário (PATCH com `farm_ids`):**

```ts
// CORREÇÃO DO BUG DE SEGURANÇA:
// Validar que TODAS as fazendas em farm_ids têm owner_id = session.gestor_id
const { data: ownedFarms } = await supabase
  .from('farms').select('id')
  .eq('owner_id', session.gestor_id)
  .in('id', farm_ids)
if (ownedFarms.length !== farm_ids.length) {
  return 403 'Tentativa de vincular fazenda de outro tenant.'
}
```

**Routes que precisam ajuste de role check:**

| Rota | Antes | Depois |
|---|---|---|
| `api/farms` POST (criar) | `role === 'admin'` | `can(role, 'farm.create')` |
| `api/farms/[id]` PATCH | `role === 'admin'` | `can(role, 'farm.edit')` |
| `api/farms/[id]` DELETE | `role === 'admin'` | `can(role, 'farm.delete')` |
| `api/farms/[id]/insumos*` | `role === 'admin'` | `can(role, 'insumo.write')` |
| `api/farms/[id]/talhoes*` | `role === 'admin'` | `can(role, 'talhao.write')` |
| `api/farms/[id]/implement-adjustments*` | `role === 'admin'` | `can(role, 'adjustment.write')` |
| `api/farms/[id]/insumos/[iid]/stock` POST | `role === 'admin'` | `can(role, 'transaction.entrada')` |
| `api/farms/[id]/transactions/[tid]` PATCH/DELETE | `role === 'admin'` | `can(role, 'transaction.edit')` |
| `api/users*` | `role === 'admin'` | `can(role, 'user.*')` |
| `api/analise/report` | `role === 'admin'` | `can(role, 'analysis.export')` |

### Frontend

**`components/Sidebar.tsx`:**
- Section "Gestão" agora aparece para Gestor + Admin
- Item "Usuários" só para Gestor + Admin
- Item "Fazendas" para todos (mas fica como vista filtrada — operário só vê suas)
- Label do perfil:
  - `gestor` → "Gestor"
  - `admin` → "Administrador"
  - `agronomo` → "Agrônomo"
  - `operario` → "Operador"

**`components/DeleteFarmButton.tsx`:**
- Só renderiza se `can(session.role, 'farm.delete')`

**`components/UserEditor.tsx` (existe):**
- Select de role com 3 opções (admin/agronomo/operario) — Gestor NUNCA via UI
- Lista de fazendas para vincular: apenas owner_id = session.gestor_id
  (server filtra; client recebe já filtrado)
- Esconder opção "admin" se actor não é gestor (admins só criam admin/agronomo/operario,
  na verdade pode criar admin também pela nossa decisão, mantém)

**`app/(app)/admin/users/page.tsx`:**
- Server query: `.eq('gestor_id', session.gestor_id)` em vez de `created_by`
- Já tem layout mobile-friendly (recém-feito)
- Badge de role: 4 cores distintas
  - Gestor: verde escuro/dourado
  - Admin: verde
  - Agrônomo: azul
  - Operário: cinza

**`app/(app)/admin/users/new/page.tsx`:**
- Form com select dos 3 cargos (sem opção Gestor)

**`components/FarmTabs.tsx` (label "aplicados"):**

Onde mostra `% Insumo` na célula da tabela de talhões e nos cards mobile,
adicionar a palavra "aplicados" depois do número. Ex: `55% aplicados`.
Mudança pequena e localizada — duas ocorrências (desktop table cell + mobile card).

### Padrões novos para `DEVELOPMENT-STANDARDS.md`

Adicionar após P7:

**P8 — Multi-tenant por Gestor**
> Toda query que retorna dados de usuário, fazenda, ou entidades-filhas DEVE
> filtrar implícita ou explicitamente por `session.gestor_id`. NUNCA confie
> em `created_by` ou em IDs vindos do client sem validar ownership.

**P9 — Permission check via capability matrix**
> Verificação de permissão em route handler usa `can(session.role, 'namespace.action')`.
> Nunca compare `session.role === 'admin'` direto — quebra ao adicionar novos cargos.
> Para verificar se ator pode gerenciar alvo: `canManageUser(actorRole, targetRole)`.

---

## Fluxo de dados

### Login → Session

```
POST /api/auth/login (email, password)
  ↓
verify bcrypt
  ↓
SELECT id, name, role, gestor_id, token_version, must_change_password FROM users
  ↓
sign JWT { id, name, email, role, gestor_id, tv: token_version }
  ↓
Set-Cookie auth_token (HTTP-only, 7d)
```

### Listar usuários do tenant

```
GET /api/users  (session: { id, gestor_id })
  ↓
can('user.list', role) → 403 se false
  ↓
SELECT FROM users WHERE gestor_id = session.gestor_id AND id != session.id
  ↓
[{id, name, email, role, must_change_password, created_at}, ...]
```

### Vincular fazendas ao usuário (correção do bug)

```
PATCH /api/users/[uid] { farm_ids: [f1, f2] }
  ↓
can('user.edit', role) → 403
  ↓
SELECT * FROM users WHERE id = uid → target
  ↓
target.gestor_id === session.gestor_id ? sim → continua : 403
  ↓
canManageUser(session.role, target.role) → 403 se false
  ↓
SELECT id FROM farms WHERE owner_id = session.gestor_id AND id IN (farm_ids)
  → se count != farm_ids.length: 403 'fazenda de outro tenant'
  ↓
DELETE FROM farm_users WHERE user_id = uid
INSERT farm_users (user_id=uid, farm_id) × N
  ↓
200
```

### Mudança de role

```
PATCH /api/users/[uid] { role: 'agronomo' }
  ↓
permissions check ... ↓
  ↓
UPDATE users SET role = 'agronomo', token_version = token_version + 1 WHERE id = uid
  ↓
invalidateTokenVersionCache(uid)
  ↓
Próxima request do uid:
  verifyTokenStrict (cache miss) → DB.token_version > JWT.tv → 401 → re-login
```

---

## Error handling

| Cenário | HTTP | Mensagem |
|---|---|---|
| Sem sessão | 401 | "Não autenticado." |
| Role insuficiente | 403 | "Sem permissão para esta ação." |
| Tenant diferente | 403 | "Acesso negado." (igual outros, não vazar tenancy) |
| Tentar criar/editar Gestor via API | 400 | "Operação não permitida." |
| Tentar deletar próprio user | 400 | "Não é possível excluir o próprio usuário." |
| Admin tentando deletar Gestor | 403 | "Sem permissão para excluir Gestor." |
| Fazenda fora do tenant em farm_ids | 403 | "Acesso negado." |
| Erro genérico de DB | 500 | "Erro interno. Tente novamente." |

NUNCA expor `error.message` do Supabase — P6.

---

## Testing manual checklist (post-deploy)

- [ ] Login com admin antigo → role = "gestor" no JWT, painel funciona normal
- [ ] Gestor cria Admin → novo user tem gestor_id = Gestor.id
- [ ] Gestor cria Agrônomo → idem
- [ ] Gestor cria Operário → idem
- [ ] Admin cria Agrônomo/Operário → herda gestor_id do Admin (= Gestor original)
- [ ] Admin tenta deletar Gestor → 403
- [ ] Gestor B faz login → NÃO vê fazendas de Gestor A
- [ ] Gestor A no editor de Operário → só vê suas próprias fazendas no select
- [ ] Tentar via curl: PATCH user com farm_id de outro tenant → 403
- [ ] Agrônomo tenta deletar fazenda → 403 (botão não aparece + API bloqueia)
- [ ] Agrônomo registra retirada → ✓
- [ ] Operário tenta criar talhão → 403 (botão não aparece)
- [ ] Operário só vê fazendas em que está em farm_users
- [ ] Mudar role de Admin para Operário → próxima request do Admin força 401
- [ ] Tabela de talhões mostra "55% aplicados" em vez de "55%"

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Backfill da migration falha em produção e deixa users órfãos | Backup antes; COALESCE fallback para admin@stockdan.com |
| Algum endpoint esquecido de migrar de `role === 'admin'` para `can()` | Grep exaustivo + manual review; spec lista todas |
| Cliente offline com JWT antigo (sem gestor_id) entra em loop | refresh route reconstrói JWT no próximo online; fallback: forçar relogin |
| Race entre criação de fazenda e listagem em outro tab | Mantém o padrão atual (router.refresh) |
| Operário existente vinculado errado a uma fazenda no farm_users | Migration não toca em farm_users; manualmente revisar se necessário |

---

## Resumo executivo

Mudança em 3 frentes:
1. **DB**: nova coluna `gestor_id`, novo CHECK de role, migração dos admins atuais
2. **Backend**: nova `lib/permissions.ts`, refactor de `checkFarmAccess`, validação de tenant em `/api/users/*`
3. **Frontend**: 4 cargos visíveis na sidebar/editor, label "aplicados" na tabela

Total estimado: ~12 arquivos tocados, 1 migration, 1 file novo (`lib/permissions.ts`).
Sem mudanças em offline-first / mutationQueue. Sem mudanças visuais relevantes
fora do que foi explicitamente pedido.
