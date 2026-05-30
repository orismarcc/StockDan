-- ============================================================
-- StockDan — Schema PostgreSQL para Supabase
-- Este arquivo é a fonte de verdade do schema atual.
-- Para ambientes novos: aplique as migrations em ordem.
-- Última atualização: 2026-05-30 (sincronizado com todas as 28 migrations)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Usuários
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  email                TEXT        UNIQUE NOT NULL,
  password_hash        TEXT        NOT NULL,
  -- Cargos pós RH-1: gestor (root do tenant), admin, agronomo, operario
  role                 TEXT        NOT NULL CHECK (role IN ('gestor','admin','agronomo','operario')),
  must_change_password BOOLEAN     NOT NULL DEFAULT TRUE,
  -- gestor_id: identifica o tenant. Gestor aponta para si mesmo.
  gestor_id            UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- token_version: incrementado para invalidar JWTs ativos (mudança de cargo)
  token_version        INTEGER     NOT NULL DEFAULT 0,
  -- Perfil estendido
  age                  SMALLINT,
  created_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS 'Usuários do sistema. Tenant isolado por gestor_id.';
COMMENT ON COLUMN users.gestor_id IS 'Root do tenant. Gestor aponta para si mesmo.';
COMMENT ON COLUMN users.token_version IS 'Incrementado em mudança de cargo para revogar JWTs emitidos antes.';
COMMENT ON COLUMN users.age IS 'Idade opcional do usuário em anos.';

-- ------------------------------------------------------------
-- Fazendas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farms (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  city              TEXT        NOT NULL,
  state             CHAR(2)     NOT NULL,
  farmer_name       TEXT        NOT NULL,
  owner_id          UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at_client TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  farms IS 'Propriedades rurais. owner_id = Gestor do tenant.';
COMMENT ON COLUMN farms.updated_at_client IS 'Timestamp do cliente para LWW conflict resolution.';

-- ------------------------------------------------------------
-- Vínculo Usuário ↔ Fazenda
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm_users (
  user_id    UUID REFERENCES users(id)  ON DELETE CASCADE,
  farm_id    UUID REFERENCES farms(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, farm_id)
);

-- ------------------------------------------------------------
-- Talhões
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS talhoes (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID          NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name              TEXT          NOT NULL,
  area_ha           NUMERIC(10,2) NOT NULL,
  updated_at_client TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Insumos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insumos (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID          NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  title             TEXT          NOT NULL,
  description       TEXT,
  unit              TEXT          NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg','L','sc')),
  quantity          NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_quantity      NUMERIC(12,3),
  updated_at_client TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN insumos.min_quantity IS 'Quantidade mínima para alerta de estoque crítico.';

-- ------------------------------------------------------------
-- Transações (movimentações de estoque)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID          NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  insumo_id         UUID          NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  talhao_id         UUID          REFERENCES talhoes(id) ON DELETE SET NULL,
  user_id           UUID          REFERENCES users(id) ON DELETE SET NULL,
  type              TEXT          NOT NULL CHECK (type IN ('entrada','saida')),
  quantity          NUMERIC(12,3) NOT NULL,
  area_ha           NUMERIC(10,2),
  date              DATE          NOT NULL,
  notes             TEXT,
  offline_id        TEXT          UNIQUE,
  created_at_client TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE transactions IS 'Movimentações de insumos. Append-only.';
COMMENT ON COLUMN transactions.offline_id IS 'Chave de idempotência para operações offline.';

CREATE INDEX IF NOT EXISTS idx_transactions_farm_date ON transactions(farm_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_insumo    ON transactions(insumo_id);

-- ------------------------------------------------------------
-- Regulagens de implementos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implement_adjustments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  talhao_id         UUID        REFERENCES talhoes(id) ON DELETE SET NULL,
  user_id           UUID        REFERENCES users(id) ON DELETE SET NULL,
  implement_type    TEXT        NOT NULL,
  notes             TEXT,
  date              DATE        NOT NULL,
  offline_id        TEXT        UNIQUE,
  created_at_client TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Audit Log (append-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT        NOT NULL,
  actor_name  TEXT        NOT NULL,
  action      TEXT        NOT NULL CHECK (action IN ('create','update','delete')),
  entity      TEXT        NOT NULL CHECK (entity IN ('farm','talhao','insumo','transaction','adjustment','user')),
  entity_id   UUID,
  farm_id     UUID        REFERENCES farms(id) ON DELETE SET NULL,
  summary     TEXT        NOT NULL,
  changes     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Audit trail append-only. Nunca fazer UPDATE/DELETE.';
CREATE INDEX IF NOT EXISTS idx_audit_log_gestor_created ON audit_log(gestor_id, created_at DESC);

-- ------------------------------------------------------------
-- Relatórios Agendados
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_schedules (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  frequency     TEXT        NOT NULL CHECK (frequency IN ('weekly','monthly')),
  day_of_week   SMALLINT    CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month  SMALLINT    CHECK (day_of_month BETWEEN 1 AND 28),
  email         TEXT        NOT NULL,
  format        TEXT        NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','xlsx')),
  sections      TEXT[]      NOT NULL DEFAULT '{}',
  window_days   SMALLINT    NOT NULL DEFAULT 30 CHECK (window_days > 0 AND window_days <= 365),
  last_sent_at  TIMESTAMPTZ,
  last_status   TEXT,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT day_required CHECK (
    (frequency = 'weekly'  AND day_of_week  IS NOT NULL) OR
    (frequency = 'monthly' AND day_of_month IS NOT NULL)
  ),
  UNIQUE(gestor_id)
);

-- ------------------------------------------------------------
-- Push Tokens (FCM — notificações Android)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gestor_id  UUID        NOT NULL,
  fcm_token  TEXT        NOT NULL UNIQUE,
  platform   TEXT        NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_gestor ON push_tokens(gestor_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user   ON push_tokens(user_id);

-- ------------------------------------------------------------
-- Row Level Security — defesa em profundidade
-- Service role bypassa RLS. Bloqueia acesso direto via anon key.
-- ------------------------------------------------------------
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE talhoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens      ENABLE ROW LEVEL SECURITY;
