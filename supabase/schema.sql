-- ============================================================
-- StockDan — Schema PostgreSQL para Supabase
-- Importe este arquivo no painel: SQL Editor > New Query > Run
-- ============================================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Usuários (autenticação própria, sem Supabase Auth)
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
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  farms IS 'Propriedades rurais cadastradas.';
COMMENT ON COLUMN farms.state IS 'Sigla UF de 2 letras (ex: SP, GO, MT).';

-- ------------------------------------------------------------
-- Vínculo Operário ↔ Fazenda
-- Admins têm acesso irrestrito e NÃO precisam de entrada aqui.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm_users (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  farm_id    UUID REFERENCES farms(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  unit         TEXT           NOT NULL CHECK (unit IN ('kg', 'bag')),
  quantity     DECIMAL(12, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity DECIMAL(12, 3)          CHECK (min_quantity IS NULL OR min_quantity >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  insumos IS 'Insumos agrícolas cadastrados por fazenda.';
COMMENT ON COLUMN insumos.unit IS 'kg ou bag (1 bag = 1.000 kg). Imutável após criação.';
COMMENT ON COLUMN insumos.quantity IS 'Estoque atual. Atualizado automaticamente a cada transação.';
COMMENT ON COLUMN insumos.min_quantity IS 'Limiar de alerta de estoque baixo (âmbar). NULL = sem alerta.';

-- ------------------------------------------------------------
-- Transações (entradas e saídas de estoque)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id   UUID NOT NULL REFERENCES farms(id)    ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id)  ON DELETE CASCADE,
  talhao_id UUID          REFERENCES talhoes(id)  ON DELETE SET NULL,
  user_id   UUID          REFERENCES users(id)    ON DELETE SET NULL,
  type      TEXT           NOT NULL CHECK (type IN ('entrada', 'saida')),
  quantity  DECIMAL(12, 3) NOT NULL CHECK (quantity > 0),
  date      DATE           NOT NULL,
  notes     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  transactions IS 'Histórico completo de movimentações de estoque.';
COMMENT ON COLUMN transactions.talhao_id IS 'Obrigatório para saídas; NULL para entradas.';
COMMENT ON COLUMN transactions.date      IS 'Data informada pelo usuário (pode diferir de created_at).';

-- ------------------------------------------------------------
-- Índices para performance
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_farm_users_farm      ON farm_users   (farm_id);
CREATE INDEX IF NOT EXISTS idx_talhoes_farm         ON talhoes      (farm_id);
CREATE INDEX IF NOT EXISTS idx_insumos_farm         ON insumos      (farm_id);
CREATE INDEX IF NOT EXISTS idx_transactions_farm    ON transactions (farm_id);
CREATE INDEX IF NOT EXISTS idx_transactions_insumo  ON transactions (insumo_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions (date DESC);
