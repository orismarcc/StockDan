-- Migration: schema inicial do StockDan
-- Tabelas base: users, farms, farm_users, insumos, talhoes, transactions

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'operario' CHECK (role IN ('admin', 'operario')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  farmer_name TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farm_users (
  farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (farm_id, user_id)
);

CREATE TABLE IF NOT EXISTS insumos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  unit         TEXT NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'bag')),
  quantity     NUMERIC(12, 3) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(12, 3),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS talhoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  area_ha    NUMERIC(10, 4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  insumo_id  UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  talhao_id  UUID REFERENCES talhoes(id) ON DELETE SET NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  quantity   NUMERIC(12, 3) NOT NULL,
  date       DATE NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
