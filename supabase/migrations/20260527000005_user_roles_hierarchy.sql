-- Migration: Hierarquia de cargos (4) + multi-tenant por gestor_id
--
-- PROBLEMA: modelo atual binário admin/operario não suporta delegação
-- (Agrônomo, Admin como mão-direita do Gestor) e a tela de gestão de usuários
-- permite vincular um usuário a fazendas de OUTRO admin (cross-tenant leak).
--
-- SOLUÇÃO:
-- 1. Estender role enum: gestor, admin, agronomo, operario
-- 2. Nova coluna users.gestor_id NOT NULL apontando para o Gestor do tenant
--    (Gestor aponta para si próprio). Todas as queries de listagem de usuários
--    e vinculação de fazendas filtram por gestor_id = session.gestor_id.
-- 3. Backfill: cada admin atual vira gestor (gestor_id = self.id).
--    Operários herdam o gestor_id do created_by (que era admin, agora gestor).
-- 4. token_version bump global → força relogin → todos pegam JWT novo com gestor_id.
--
-- Idempotente: usa IF NOT EXISTS / IF EXISTS / CHECK substituível.

-- ── 1. CHECK constraint substituído (drop antigo, add novo) ─────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('gestor','admin','agronomo','operario'));

-- ── 2. Coluna gestor_id (nullable inicialmente para backfill) ───────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES users(id);

COMMENT ON COLUMN users.gestor_id IS
  'Raiz do tenant. Gestor aponta para si proprio; demais cargos para o Gestor do tenant.';

-- ── 3. Backfill: admins atuais viram gestores ───────────────────────────────
UPDATE users
SET role = 'gestor',
    gestor_id = id
WHERE role = 'admin';

-- ── 4. Backfill: demais users herdam gestor_id do created_by (agora gestor) ─
-- Fallback final: admin@stockdan.com (caso created_by NULL ou orfão)
UPDATE users u
SET gestor_id = COALESCE(
  (SELECT id FROM users WHERE id = u.created_by AND role = 'gestor'),
  (SELECT id FROM users WHERE email = 'admin@stockdan.com' AND role = 'gestor' LIMIT 1)
)
WHERE u.gestor_id IS NULL;

-- ── 5. Promover gestor_id para NOT NULL (após backfill) ─────────────────────
-- Se algum gestor_id permaneceu NULL, isto vai falhar — sinal de seed inconsistente
ALTER TABLE users ALTER COLUMN gestor_id SET NOT NULL;

-- ── 6. Index para queries por tenant ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_gestor_id ON users(gestor_id);

-- ── 7. Bump token_version global → força relogin de TODOS ───────────────────
-- Razão: JWTs antigos não têm gestor_id; precisam ser reissued pelo /login
UPDATE users SET token_version = token_version + 1;
