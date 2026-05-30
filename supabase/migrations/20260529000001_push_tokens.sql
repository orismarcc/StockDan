-- Migration: Push tokens para notificações Firebase (FCM)
--
-- PROBLEMA: sem persistência de tokens FCM, não é possível enviar push
-- notifications para dispositivos Android do tenant.
--
-- SOLUÇÃO: tabela push_tokens com isolamento por gestor_id (P8).
-- Upsert por fcm_token (UNIQUE) — token atualizado automaticamente se
-- o usuário reinstalar o app. Cascade delete vinculado ao usuário.

CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gestor_id  UUID        NOT NULL,
  fcm_token  TEXT        NOT NULL UNIQUE,
  platform   TEXT        NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE push_tokens IS
  'FCM tokens para push notifications. Isolado por gestor_id (tenant). Upsert por fcm_token.';

CREATE INDEX IF NOT EXISTS idx_push_tokens_gestor
  ON push_tokens(gestor_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens(user_id);
