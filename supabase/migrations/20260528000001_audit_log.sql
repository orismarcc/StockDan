-- Migration: Audit log (histórico de auditoria)
--
-- PROBLEMA: hoje não há registro de quem alterou/excluiu o quê. Em disputa
-- ("apaguei sem querer", "este talhão era de 10ha, virou 5ha") não há evidência.
--
-- SOLUÇÃO: tabela audit_log com:
--   - gestor_id: tenant (isolamento)
--   - actor_id, actor_role, actor_name: quem fez (snapshot)
--   - action: 'create' | 'update' | 'delete'
--   - entity: 'farm' | 'talhao' | 'insumo' | 'transaction' | 'adjustment' | 'user'
--   - entity_id: id do registro afetado
--   - summary: descrição curta legível (ex: "Excluiu talhão 'Quadra 3' (12,5 ha)")
--   - changes: JSONB com snapshot dos campos alterados (opcional)
--   - created_at: timestamp do servidor (não-falsificável)
--
-- Append-only por design: nunca UPDATE, nunca DELETE. Retenção via partition
-- futura se crescer demais (não-MVP).

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role   TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('create','update','delete')),
  entity       TEXT NOT NULL CHECK (entity IN ('farm','talhao','insumo','transaction','adjustment','user')),
  entity_id    UUID,
  farm_id      UUID REFERENCES farms(id) ON DELETE SET NULL,
  summary      TEXT NOT NULL,
  changes      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS
  'Append-only audit trail. Isolado por gestor_id (tenant). Não fazer UPDATE/DELETE nesta tabela.';

-- Index para listagem por tenant ordenada por data
CREATE INDEX IF NOT EXISTS idx_audit_log_gestor_created
  ON audit_log(gestor_id, created_at DESC);

-- Index para filtro por entidade/usuário
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_farm  ON audit_log(farm_id);
