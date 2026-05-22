-- Migration: tabela de regulagem de implementos por talhão
CREATE TABLE IF NOT EXISTS implement_adjustments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id              UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  talhao_id            UUID NOT NULL REFERENCES talhoes(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
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
