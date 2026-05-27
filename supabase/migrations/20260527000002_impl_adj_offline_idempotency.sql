-- Migration: Idempotencia para regulagens de implemento offline
--
-- Mesmo padrao de transactions (20260523000009): adiciona offline_id +
-- updated_at_client para suportar criar/editar/excluir regulagens offline com:
--  - idempotencia em retries (UUID v4 cliente como chave)
--  - LWW (last-write-wins) em conflitos de PATCH usando timestamp do cliente
--
-- offline_id: imutavel apos primeira escrita. Identifica unicamente a regulagem
-- desde sua criacao no cliente, mesmo antes do server gerar seu UUID.
--
-- updated_at_client: timestamp do momento que o usuario fez a alteracao no
-- cliente. Server compara com seu proprio updated_at: se cliente.updated_at_client
-- > server.updated_at, aplica a mudanca; senao ignora (other user venceu).

-- 1. Adiciona colunas
ALTER TABLE implement_adjustments
  ADD COLUMN IF NOT EXISTS offline_id          TEXT,
  ADD COLUMN IF NOT EXISTS updated_at_client   TIMESTAMPTZ;

COMMENT ON COLUMN implement_adjustments.offline_id IS
  'Chave de idempotencia para operacoes offline. NULL = operacao online direta.';

COMMENT ON COLUMN implement_adjustments.updated_at_client IS
  'Timestamp do momento que o cliente fez a alteracao. Usado para LWW em
   conflitos de PATCH (cliente vence se valor maior que server.updated_at).';

-- 2. Indice UNIQUE parcial — so cobre linhas com offline_id preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_implement_adjustments_offline_id
  ON implement_adjustments (offline_id)
  WHERE offline_id IS NOT NULL;
