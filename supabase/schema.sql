-- ============================================================
-- StockDan — Schema PostgreSQL para Supabase
-- Este arquivo é a fonte de verdade do schema atual.
-- Para ambientes novos: aplique as migrations em ordem.
-- Última atualização: 2026-05-23 (migrations 001–008)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Usuários
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  email                TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('admin', 'operario')),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS 'Usuários do sistema (admins e operários).';
COMMENT ON COLUMN users.must_change_password IS 'Força redefinição de senha no primeiro acesso.';

-- ------------------------------------------------------------
-- Fazendas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  city        TEXT    NOT NULL,
  state       CHAR(2) NOT NULL,
  farmer_name TEXT    NOT NULL,
  owner_id    UUID    REFERENCES users(id) ON DELETE SET NULL,  -- NULL = aguarda claim
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  farms IS 'Propriedades rurais cadastradas.';
COMMENT ON COLUMN farms.state    IS 'Sigla UF de 2 letras (ex: SP, GO, MT).';
COMMENT ON COLUMN farms.owner_id IS 'Admin responsável. NULL = fazenda não reivindicada (apenas /api/farms/:id/claim pode atribuir).';

-- ------------------------------------------------------------
-- Vínculo Operário ↔ Fazenda
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm_users (
  user_id    UUID REFERENCES users(id)  ON DELETE CASCADE,
  farm_id    UUID REFERENCES farms(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, farm_id)
);

COMMENT ON TABLE farm_users IS 'Vincula operários às fazendas que podem acessar.';

-- ------------------------------------------------------------
-- Talhões
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS talhoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name       TEXT           NOT NULL,
  area_ha    DECIMAL(10, 2) NOT NULL CHECK (area_ha > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_talhao_name_per_farm UNIQUE (farm_id, name)
);

COMMENT ON TABLE  talhoes IS 'Divisões de área dentro de uma fazenda.';
COMMENT ON COLUMN talhoes.area_ha IS 'Área em hectares.';

-- ------------------------------------------------------------
-- Insumos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insumos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  title        TEXT           NOT NULL,
  description  TEXT,
  unit         TEXT           NOT NULL DEFAULT 'kg' CHECK (unit = 'kg'),
  quantity     DECIMAL(12, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity DECIMAL(12, 3)          CHECK (min_quantity IS NULL OR min_quantity >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_insumo_title_per_farm UNIQUE (farm_id, title)
);

COMMENT ON TABLE  insumos IS 'Insumos agrícolas cadastrados por fazenda.';
COMMENT ON COLUMN insumos.unit         IS 'Sempre kg. Unidade bag foi removida na migration 20260522000005.';
COMMENT ON COLUMN insumos.quantity     IS 'Estoque atual. Atualizado pelas RPCs registrar_entrada/saida/ajustar_estoque.';
COMMENT ON COLUMN insumos.min_quantity IS 'Limiar de alerta de estoque baixo (âmbar). NULL = sem alerta.';

-- ------------------------------------------------------------
-- Transações (entradas e saídas de estoque)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES farms(id)   ON DELETE CASCADE,
  insumo_id  UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  talhao_id  UUID          REFERENCES talhoes(id) ON DELETE SET NULL,
  user_id    UUID          REFERENCES users(id)   ON DELETE SET NULL,
  type       TEXT           NOT NULL CHECK (type IN ('entrada', 'saida')),
  quantity   DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
  date       DATE           NOT NULL,
  notes      TEXT,
  area_ha    NUMERIC(10, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  transactions IS 'Histórico completo de movimentações de estoque.';
COMMENT ON COLUMN transactions.talhao_id IS 'NULL para entradas ou quando o talhão foi excluído (histórico preservado).';
COMMENT ON COLUMN transactions.date      IS 'Data informada pelo usuário (pode diferir de created_at).';
COMMENT ON COLUMN transactions.area_ha   IS 'Área trabalhada em hectares (saídas). Opcional.';

-- ------------------------------------------------------------
-- Regulagem de Implementos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implement_adjustments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id              UUID NOT NULL REFERENCES farms(id)   ON DELETE CASCADE,
  talhao_id            UUID          REFERENCES talhoes(id) ON DELETE SET NULL,  -- nullable: preserva histórico
  user_id              UUID          REFERENCES users(id)   ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  implemento           TEXT,
  taxa_kgha            NUMERIC(10, 2),
  palhetas             TEXT,
  rpm_maquina          NUMERIC(10, 0),
  rpm_pratos_eixo      NUMERIC(10, 0),
  num_bandejas         NUMERIC(10, 0),
  espacamento_bandejas TEXT,
  cv_percent           NUMERIC(10, 2),
  faixa_aplicacao      TEXT,
  comporta             TEXT
);

COMMENT ON TABLE  implement_adjustments IS 'Histórico de regulagem de implementos por talhão.';
COMMENT ON COLUMN implement_adjustments.talhao_id IS 'NULL se o talhão foi excluído (histórico de regulagem preservado).';

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
-- Existentes (migration inicial)
CREATE INDEX IF NOT EXISTS idx_farm_users_farm          ON farm_users   (farm_id);
CREATE INDEX IF NOT EXISTS idx_talhoes_farm             ON talhoes      (farm_id);
CREATE INDEX IF NOT EXISTS idx_insumos_farm             ON insumos      (farm_id);
CREATE INDEX IF NOT EXISTS idx_transactions_farm        ON transactions (farm_id);
CREATE INDEX IF NOT EXISTS idx_transactions_insumo      ON transactions (insumo_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date        ON transactions (date DESC);

-- Adicionados na auditoria (migration 20260523000002)
CREATE INDEX IF NOT EXISTS idx_farms_owner_id           ON farms                 (owner_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by         ON users                 (created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_talhao      ON transactions          (talhao_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user        ON transactions          (user_id);
CREATE INDEX IF NOT EXISTS idx_impl_adj_farm            ON implement_adjustments (farm_id);
CREATE INDEX IF NOT EXISTS idx_impl_adj_talhao          ON implement_adjustments (talhao_id);
CREATE INDEX IF NOT EXISTS idx_transactions_farm_date_type
  ON transactions (farm_id, date DESC, type);

-- ------------------------------------------------------------
-- View de diagnóstico de integridade de estoque
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_stock_integrity AS
SELECT
  i.id,
  i.farm_id,
  f.name                                    AS farm_name,
  i.title,
  i.unit,
  i.quantity                                AS stored_qty,
  COALESCE(SUM(
    CASE
      WHEN t.type = 'entrada' THEN  t.quantity
      WHEN t.type = 'saida'   THEN -t.quantity
      ELSE 0
    END
  ), 0)                                     AS computed_qty,
  i.quantity - COALESCE(SUM(
    CASE
      WHEN t.type = 'entrada' THEN  t.quantity
      WHEN t.type = 'saida'   THEN -t.quantity
      ELSE 0
    END
  ), 0)                                     AS discrepancy,
  COUNT(t.id)                               AS transaction_count
FROM  insumos i
JOIN  farms f ON f.id = i.farm_id
LEFT JOIN transactions t ON t.insumo_id = i.id
GROUP BY i.id, i.farm_id, f.name, i.title, i.unit, i.quantity;

COMMENT ON VIEW v_stock_integrity IS
  'discrepancy != 0 indica divergência entre estoque armazenado e calculado pelas transactions.';
