# Auditoria Offline-First — StockDan

**Data:** 2026-05-27
**Escopo:** Avaliar prontidão offline do StockDan para uso em campo com múltiplos
operários, longos períodos sem internet, e sincronização resiliente.

---

## Sumário executivo

StockDan **já tem fundação offline sólida para o caminho mais crítico** —
retiradas de insumo — com outbox, idempotency, cache otimista, lock entre abas,
retry com categorização de erros e UX dedicada. O backend respeita
`offline_id` como chave de idempotência via RPC atômica `registrar_saida`.

**Pontos fortes diferenciam StockDan de muitos PWAs:**
- UUIDs gerados no cliente (`crypto.randomUUID()`) com idempotência server-side
- Banner de sync com pending count + rejected items + razão de falha
- `verifyConnectivity()` via `/api/ping` antes de gastar retries
- Cross-tab lock (`syncLock.ts`) com TTL anti-deadlock

**A lacuna:** **só funciona offline para retiradas.** Tudo o mais (regulagens,
criar talhão, criar insumo, editar fazenda, gerenciar usuário, ver histórico,
ver lista de regulagens) requer conexão. Operário no campo que quer registrar
uma regulagem que acabou de fazer não consegue.

---

## Estado atual (mapa de evidência)

### ✅ Já funciona offline

| Capacidade | Arquivo | Como funciona |
|---|---|---|
| Outbox de retiradas | `lib/offlineQueue.ts` | UUID v4 cliente, MAX_RETRIES=5, QuotaExceeded trapping |
| Cache de insumos por fazenda | `lib/insumoCache.ts` | TTL 4h + `decreaseQuantity` para saldo otimista |
| Lock entre abas | `lib/syncLock.ts` | TTL 30s, anti-crash de aba |
| Sync engine | `hooks/useSyncQueue.ts` | Ping check + 15s timeout + 4xx permanente vs 5xx transitório + lock renew |
| UI offline | `components/ConnectionStatus.tsx` + `WithdrawalForm.tsx` | Banner pendente/sync/rejeitado, hint "estoque desatualizado >4h", storage-full alert |
| Idempotência server | `app/api/farms/[id]/transactions/route.ts:77-93` | Checa `offline_id` antes de inserir, retorna existing se já processado |
| Atomicidade DB | RPC `registrar_saida` | UPDATE insumos + INSERT transactions na mesma TX |
| Sessão | `lib/auth.ts` | JWT HS256 com TTL 7d em cookie → funciona offline até expirar |
| Service Worker | `public/sw.js` | Precache de icons/manifest, network-first nav com fallback HTML inline, cache-first `/_next/static/` |
| Multi-user retiradas | RPC + idempotency | Cada operário tem própria fila + UUID único → reconciliação correta no servidor |

### ❌ NÃO funciona offline

| Operação | Rota | Impacto |
|---|---|---|
| Criar/editar talhão | `POST/PATCH /api/farms/[id]/talhoes` | Admin não cadastra área no campo |
| Criar/editar insumo + estoque | `POST /api/farms/[id]/insumos` + `/stock` | Admin não cadastra novo produto offline |
| **Criar regulagem de implemento** | `POST /api/farms/[id]/implement-adjustments` | **Operário no campo perde a regulagem que acabou de fazer** |
| Editar/excluir regulagem | `PATCH/DELETE .../[adjId]` | Idem |
| Criar/editar/deletar fazenda | `POST/PATCH/DELETE /api/farms[/id]` | Admin trava |
| Reivindicar fazenda (claim) | `POST /api/farms/[id]/claim` | Trava primeiro acesso |
| Gerenciar usuário | `POST/PATCH/DELETE /api/users` | Admin online-only (aceitável) |
| Gerar relatório PDF/Excel | `POST /api/analise/report` | Análise online-only (aceitável) |
| Ler histórico de retiradas | `GET /api/farms/[id]/transactions` | Vê via SSR — falha offline se página não cacheada |
| Ler lista de regulagens | `GET /api/farms/[id]/implement-adjustments` | Idem |

---

## Gaps por severidade

### ⛔ P0 — Bloqueia uso real no campo

#### P0-1: Operário não consegue registrar regulagem offline
**Cenário:** operário ajusta o implemento (palhetas, RPM, faixa, comporta) e
quer salvar imediatamente para não esquecer os números. Offline → fetch falha
→ form mostra erro → dado **perdido**.

**Por que crítico:** regulagens são feitas justamente no campo, longe de
sinal. É o **segundo** caso de uso depois das retiradas. Sem isso, operário
volta pro escritório com regulagem no papel, o que derrota a função do app.

**Evidência:** `components/ImplementAdjustmentForm.tsx:107` faz `fetch` direto
sem fallback offline. Mesma situação para PATCH/DELETE.

#### P0-2: Páginas SSR-críticas inacessíveis offline
Quando você navega para `/farms/[id]/retirada` offline, o SW tenta
network-first. Se a página não foi visitada antes, cai no fallback HTML
genérico ("Sem conexão") em vez de mostrar o form de retirada com os dados
cacheados. Sem isso, o operário não consegue **chegar** no form para usar a
queue offline que funciona.

**Páginas críticas que precisam estar pré-cacheadas:**
- `/dashboard` ou `/farms` (entrada)
- `/farms/[id]` (visão da fazenda)
- `/farms/[id]/retirada` (form de retirada — usado mesmo offline)
- `/farms/[id]/talhoes/[tid]` (detalhe do talhão com regulagens)

**Evidência:** `public/sw.js:46-64` faz network-first sem precache de rotas
dinâmicas. `PRECACHE` (linha 4-12) só inclui icons + manifest.

#### P0-3: Cache de insumos/talhões só popula DEPOIS de visitar form de retirada
`insumoCache.setFarm()` é chamado apenas em `WithdrawalForm.tsx:65` (no
`useEffect` do mount). Se o usuário abre o app pela primeira vez offline, ou
vai para outra página antes do form, **o select de insumos vem vazio**.

Talhões não têm cache local algum — sempre vêm do servidor via SSR.

**Solução:** pre-fetch ao login (ou ao entrar na fazenda) salva insumos +
talhões no localStorage / IndexedDB para todos os usos posteriores offline.

---

### ⚠️ P1 — Quebram experiência ou consistência

#### P1-1: Sem outbox para operações além de retiradas
Toda a infraestrutura excelente (`offlineQueue`, `syncLock`, retry, UI) está
codificada **especificamente para retiradas** (`POST /transactions`).
Regulagens, CRUD de talhões, edição de insumos não têm fila — só direct fetch.

**Recomendação:** generalizar `offlineQueue` para suportar operações
arbitrárias (tabela alvo + payload + endpoint + método HTTP).

#### P1-2: Auth não tem refresh offline
JWT expira em 7d sem possibilidade de extend offline. Operário que ficar
8+ dias offline (cenário plausível em fazenda isolada) → cookie inválido →
próximo request volta 401 → vai pro login → **não consegue logar offline** →
app travado, retiradas pendentes não sincronizam.

**Mitigação curto prazo:** aumentar TTL para 30d e mostrar warning quando
faltar < 3d para expirar (oportunidade de reconexão).

**Solução robusta:** refresh token rotativo persistido cliente-side, refresh
silencioso sempre que online.

#### P1-3: Sem persistência de form em rascunho
Se operário preencher form de retirada (insumo + talhão + qty + observação) e
fechar a aba antes de submeter → perde tudo. Sem auto-save em localStorage.

#### P1-4: Sem botão "tentar sincronizar agora"
`useSyncQueue` expõe `sync` function mas a UI não tem botão visível. Usuário
não tem ação manual quando algo está pendente há muito tempo (ex: tem sinal
fraco oscilando, quer forçar tentativa).

#### P1-5: Multi-user com escritas concorrentes em entidades não-aditivas
Retiradas são aditivas (RPC `registrar_saida` é comutativa e idempotente — OK).
Mas para regulagens, talhões e insumos, dois admins offline editando o mesmo
recurso → último a sincronizar sobrescreve o outro (LWW implícito sem
detecção). Precisa de:
- `updated_at` cliente como tiebreaker
- Log de conflitos quando diff > threshold
- Tombstone para deleção (não ressuscitar registro deletado por outro user)

---

### ℹ️ P2 — UX e robustez

| # | Gap | Onde | Severidade |
|---|---|---|---|
| P2-1 | localStorage como único storage (quota ~5-10MB) | `offlineQueue`, `insumoCache`, `syncLock` | Saturará com >300 retiradas pendentes + cache de várias fazendas. Migrar para IndexedDB (Dexie ~30KB, 50-250MB quota) |
| P2-2 | SW `skipWaiting()` imediato | `public/sw.js:24` | Pode interromper user offline mid-edit. Adicionar prompt "atualização disponível, recarregar?" como já existe em `SwRegistration.tsx` |
| P2-3 | Sem rate-limit no resync ao reconectar | `useSyncQueue.ts:61` | Loop síncrono OK, mas pode causar 429 em rede flutuante. Adicionar delay 200ms entre requests |
| P2-4 | Sem indicador de "última sincronização há Xmin" | `ConnectionStatus.tsx` | User não sabe se cache de leituras está fresco |
| P2-5 | Sem log de auditoria das operações offline | — | Difícil debug quando algo dá errado em campo |
| P2-6 | `cacheGet` em insumos retorna `[]` se >4h em vez de cached stale data | `insumoCache.ts:48` | Offline com >4h → user vê lista vazia em vez de "dados de 5h atrás". Mostrar com warning é melhor |

---

## Score atual de prontidão offline

| Dimensão | Score | Comentário |
|---|---|---|
| App shell (SW + bundle) | 7/10 | Funciona, mas precache de páginas críticas faltando |
| Leitura offline | 3/10 | Só insumos têm cache (e só pós-form) |
| Escrita offline — retiradas | **9/10** | Excelente; multi-user, idempotente, atômico |
| Escrita offline — outras | **1/10** | Nada funciona além de retiradas |
| Persistência local | 5/10 | localStorage funciona, mas saturará |
| Sync engine | 8/10 | Sólido para retiradas, monolítico — não estende |
| Auth offline | 6/10 | JWT 7d OK no curto prazo, sem refresh é frágil |
| UX offline | 7/10 | Banner bom, falta botão sync e draft de forms |
| Multi-user reconciliação | 7/10 (retiradas), 2/10 (resto) | Retiradas: server-authoritative via RPC. Resto: ausente |
| **Composto** | **53/90 (59%)** | **Sólido para retiradas, frágil para o resto** |

(Comparação: o OryAgro estaria em ~24% — StockDan está bem à frente, mas tem
arquitetura para crescer.)

---

## Recomendação arquitetural

A boa notícia: **não precisa rewrite.** A infraestrutura existente é boa, só
precisa ser **generalizada** e **expandida**:

### Estratégia: estender o pattern existente

1. **Generalizar `offlineQueue`** de "queue de retiradas" para "queue de
   operações arbitrárias":
   ```ts
   interface QueueItem<T = unknown> {
     id: string                      // UUID v4 cliente
     op: 'POST' | 'PATCH' | 'DELETE'
     endpoint: string                // ex: '/api/farms/abc/implement-adjustments'
     payload: T
     created_at: string
     retries: number
   }
   ```
   Mantém `transactions` como caminho rápido (sem regressão), adiciona suporte
   genérico para regulagens, talhões, insumos.

2. **Pre-fetch ao entrar na fazenda:** quando user navega para `/farms/[id]`,
   carregar e cachear: insumos + talhões + última regulagem por talhão.
   Salvar em localStorage (ou IndexedDB se P2-1 for atacado).

3. **Service Worker com precache dinâmico das páginas críticas:**
   - Ao online, SW pre-fetch das rotas mais usadas (`/farms`, `/farms/[id]`,
     `/farms/[id]/retirada`)
   - Estratégia stale-while-revalidate para GETs de API (já tem `Cache-Control`
     adequado no servidor)

4. **Idempotência server para outras tabelas:** Add coluna `offline_id` em
   `implement_adjustments`, `talhoes`, `insumos`. Repetir o pattern do
   `transactions/route.ts:77-93` (check antes de insert).

5. **Form drafts:** auto-save em localStorage a cada change, restaurar ao
   reabrir form vazio.

6. **Auth refresh:** ao detectar `online`, fazer ping com refresh do JWT (server
   re-issue com novo TTL). Cookie expira em 7d, mas é refrescado toda vez
   que online.

### Estratégia: NÃO fazer

- ❌ Migrar tudo para Dexie/IndexedDB agora — overhead sem benefício imediato
  (quota só vira problema com escala que ainda não temos)
- ❌ Adotar PowerSync / Electric SQL — vendor lock-in para problema que está
  90% resolvido com o que existe
- ❌ Background Sync API — funciona mal em iOS Safari, e nossa abordagem
  `useSyncQueue` + `online` event já cobre o caso

---

## Plano de fases sugerido (a confirmar)

| Fase | Escopo | Tempo |
|---|---|---|
| **F1 — Regulagens offline** | Generalizar `offlineQueue` + outbox para `POST/PATCH/DELETE implement-adjustments` + idempotency server-side. Adapta `ImplementAdjustmentForm` para enqueue se offline. | 3-4 dias |
| **F2 — Pre-fetch + cache de leituras** | Cachear insumos+talhões+regulagens ao entrar na fazenda. Adapta `TalhaoTabs`, `EstoquePage` para usar cache offline. Pre-cache de páginas críticas no SW. | 3-5 dias |
| **F3 — UX polish** | Botão "sincronizar agora", drafts de forms, indicador "último sync há Xmin", warning de cache stale (vs hide). | 2-3 dias |
| **F4 — Auth resiliente** | TTL 30d + refresh silencioso online + warning antes de expirar. | 2 dias |
| **F5 — Hardening multi-user** | `offline_id` + `updated_at` cliente para regulagens. Tombstone para deleções. Conflict log. Stress tests com 2 admins offline simultâneos. | 4-5 dias |
| **F6 — Storage migration** | (Opcional, só se chegarmos perto da quota) Migrar de localStorage para Dexie/IndexedDB. | 3-4 dias |

**Total realista: 2-3 semanas** para F1-F5. F6 só se necessário.

(Compare com o que eu havia estimado pro OryAgro: 5-8 semanas. StockDan tem
um avanço estrutural significativo.)

---

## Próximo passo

Após aprovação desta auditoria → abrir spec da **Fase 1 (regulagens offline)**
como prova de conceito da generalização do `offlineQueue`. Se a F1 passar
limpo, F2-F5 seguem o mesmo padrão.
