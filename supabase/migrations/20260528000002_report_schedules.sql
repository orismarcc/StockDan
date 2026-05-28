-- Migration: Relatórios agendados (opt-in)
--
-- PROBLEMA: Gestor que não abre o sistema todo dia perde visibilidade. Hoje
-- relatórios são manuais (clicar e baixar PDF/Excel).
--
-- SOLUÇÃO: tabela report_schedules onde Gestor configura:
--   - frequency: 'weekly' | 'monthly'
--   - day_of_week ou day_of_month: quando enviar
--   - email: destinatário (default = email do gestor)
--   - format: 'pdf' | 'xlsx'
--   - sections: TEXT[] (mesmas do export manual)
--   - enabled: opt-in. Default false. Gestor decide se quer.
--
-- O cron (/api/cron/send-reports) roda diariamente, verifica quais schedules
-- estão "due" e envia. Atualiza last_sent_at para evitar duplicatas.

CREATE TABLE IF NOT EXISTS report_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  frequency       TEXT NOT NULL CHECK (frequency IN ('weekly','monthly')),
  -- 0 = domingo, 6 = sábado (apenas para weekly)
  day_of_week     SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  -- 1-28 (apenas para monthly; limitamos a 28 para evitar problemas em fev)
  day_of_month    SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
  email           TEXT NOT NULL,
  format          TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','xlsx')),
  -- Subset das seções disponíveis. Vazio = todas.
  sections        TEXT[] NOT NULL DEFAULT '{}',
  -- Janela de dados: últimos N dias do envio
  window_days     SMALLINT NOT NULL DEFAULT 30 CHECK (window_days > 0 AND window_days <= 365),
  last_sent_at    TIMESTAMPTZ,
  last_status     TEXT,   -- 'sent' | 'failed' | 'no_data'
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Garante consistência: weekly tem day_of_week, monthly tem day_of_month
  CONSTRAINT day_required CHECK (
    (frequency = 'weekly'  AND day_of_week IS NOT NULL) OR
    (frequency = 'monthly' AND day_of_month IS NOT NULL)
  ),
  -- Apenas um schedule por gestor (simplifica MVP; pode evoluir depois)
  UNIQUE(gestor_id)
);

COMMENT ON TABLE report_schedules IS
  'Agendamento de relatórios automáticos por tenant. Opt-in (enabled default false).';

CREATE INDEX IF NOT EXISTS idx_report_schedules_due
  ON report_schedules(enabled, last_sent_at)
  WHERE enabled = TRUE;
