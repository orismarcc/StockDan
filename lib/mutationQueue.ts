/**
 * Fila genérica de mutações offline.
 *
 * Complementa `offlineQueue.ts` (que é especifico de retiradas/transactions
 * e mantemos intocado para nao introduzir regressao). Esta fila aceita
 * qualquer POST/PATCH/DELETE para qualquer endpoint da API.
 *
 * Cada item tem um `offline_id` (UUID v4 gerado no cliente) que serve como
 * idempotency key — o servidor deve verificar este id antes de processar a
 * mutacao, garantindo que retries nunca dupliquem.
 *
 * Multi-user: dois usuarios offline criando recursos similares geram UUIDs
 * diferentes, entao ambos sao persistidos no servidor (comportamento correto).
 * Para UPDATE/DELETE da mesma linha, o servidor aplica LWW por updated_at_client
 * (cliente envia timestamp do momento da operacao).
 *
 * ── TTL (design consciente) ──────────────────────────────────────────────────
 * Esta fila NÃO aplica TTL. Ao contrário de `offlineQueue` (retiradas de
 * estoque que caducam após 24h para evitar aplicações de insumos desatualizadas),
 * mutações genéricas (PATCH em regulagens, edições de nome, etc.) não têm
 * urgência de prazo — aplica-las tarde é melhor do que descarta-las
 * silenciosamente. Se necessário no futuro, adicionar TTL seletivo por `method`.
 * Em caso de sessão expirada (401), `useSyncQueue` limpa a fila via `clear()`.
 */

const QUEUE_KEY = 'stockdan_mutation_queue'
const MAX_RETRIES = 5

export type MutationOp = 'POST' | 'PATCH' | 'DELETE'

/** Tipo de entidade — usado para mensagens no UI e roteamento de cache local. */
export type MutationEntity =
  | 'implement_adjustment'
  | 'transaction'        // edicao/exclusao de retirada existente
  | 'stock_entry'        // entrada de estoque (admin)

export interface MutationItem {
  /** UUID v4 gerado no cliente. Usado como idempotency key (`offline_id`) e
   *  como id local da entidade ate o servidor responder. */
  id: string
  entity: MutationEntity
  op: MutationOp
  /** Endpoint absoluto sem origin, ex: /api/farms/abc/implement-adjustments */
  endpoint: string
  /** Body JSON a ser enviado. Para PATCH/DELETE pode ser vazio. */
  payload: Record<string, unknown>
  /** Quando a operacao foi feita no cliente. Usado pelo servidor para LWW
   *  em conflitos de PATCH (cliente vence se updated_at_client > server.updated_at). */
  client_ts: string
  /** Para PATCH/DELETE: id da entidade alvo no servidor (pode ser igual ao `id`
   *  se a entidade foi criada offline e ainda nao sincronizou). */
  target_id?: string
  /** Quando entrou na fila. */
  created_at: string
  retries: number
}

function read(): MutationItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function write(items: MutationItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('STORAGE_FULL')
    }
    throw e
  }
}

export const mutationQueue = {
  MAX_RETRIES,

  getAll: read,

  /**
   * Adiciona uma mutacao na fila. Para POST, gera UUID v4 novo. Para
   * PATCH/DELETE de uma entidade ja criada online (com id do servidor),
   * passe `id` explicitamente igual ao server id — assim retries idempotentes
   * funcionam.
   */
  add(input: {
    entity: MutationEntity
    op: MutationOp
    endpoint: string
    payload: Record<string, unknown>
    target_id?: string
    /** Opcional. Se omitido, gera UUID v4. */
    id?: string
  }): MutationItem {
    const item: MutationItem = {
      id: input.id ?? crypto.randomUUID(),
      entity: input.entity,
      op: input.op,
      endpoint: input.endpoint,
      payload: input.payload,
      client_ts: new Date().toISOString(),
      target_id: input.target_id,
      created_at: new Date().toISOString(),
      retries: 0,
    }
    write([...read(), item])
    return item
  },

  remove(id: string) {
    write(read().filter((i) => i.id !== id))
  },

  /** Incrementa retry. Retorna true se ultrapassou o limite (foi removido). */
  incrementRetry(id: string): boolean {
    const items = read()
    const updated = items.map((i) => (i.id === id ? { ...i, retries: i.retries + 1 } : i))
    const item = updated.find((i) => i.id === id)
    if (item && item.retries >= MAX_RETRIES) {
      write(items.filter((i) => i.id !== id))
      return true
    }
    write(updated)
    return false
  },

  count(): number {
    return read().length
  },

  /** Itens pendentes filtrados por entidade — util para UI mostrar status local. */
  countByEntity(entity: MutationEntity): number {
    return read().filter((i) => i.entity === entity).length
  },

  /** Lista itens pendentes por (entidade, target_id) — util para sobrepor cache local. */
  pendingForTarget(entity: MutationEntity, targetId: string): MutationItem[] {
    return read().filter((i) => i.entity === entity && i.target_id === targetId)
  },

  clear() {
    write([])
  },
}
