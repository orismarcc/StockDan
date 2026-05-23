-- Migration: índices faltantes identificados na auditoria de performance
--
-- Situação antes: 5 colunas usadas em WHERE/JOIN/ORDER sem índice → full table scans
--
-- farms.owner_id          → GET /api/farms (admin) e relatórios
-- users.created_by        → GET /api/users e GET /api/users/:uid
-- transactions.talhao_id  → relatórios, filtros por talhão
-- transactions.user_id    → relatórios de operadores
-- implement_adjustments.farm_id / talhao_id → GET /api/farms/:id/implement-adjustments
--
-- Índice composto (farm_id, date DESC, type): cobre 100% das queries de relatório
-- que filtram WHERE farm_id IN (...) AND type = 'saida' AND date BETWEEN ? AND ?

CREATE INDEX IF NOT EXISTS idx_farms_owner_id
  ON farms (owner_id);

CREATE INDEX IF NOT EXISTS idx_users_created_by
  ON users (created_by);

CREATE INDEX IF NOT EXISTS idx_transactions_talhao
  ON transactions (talhao_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user
  ON transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_impl_adj_farm
  ON implement_adjustments (farm_id);

CREATE INDEX IF NOT EXISTS idx_impl_adj_talhao
  ON implement_adjustments (talhao_id);

-- Composto crítico para relatórios
CREATE INDEX IF NOT EXISTS idx_transactions_farm_date_type
  ON transactions (farm_id, date DESC, type);
