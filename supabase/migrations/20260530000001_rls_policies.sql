-- Migration: Row Level Security (RLS) — defesa em profundidade
--
-- PROBLEMA: mesmo com service_role key no servidor, RLS garante que
-- nenhum acesso direto via anon key ou queries vazadas exponha dados
-- de outros tenants. Camada extra de proteção além do código da aplicação.
--
-- ABORDAGEM: políticas restritivas (default deny) para anon key.
-- O service_role key (usado pelo servidor) ignora RLS por design.
-- Usuários autenticados via JWT Supabase (se adotado futuramente) teriam
-- acesso filtrado por seu gestor_id.
--
-- NOTA: o app atualmente usa service_role key — RLS não bloqueia as
-- operações da aplicação. Protege contra acesso externo direto ao banco.

-- Habilitar RLS nas tabelas sensíveis (sem apagar políticas existentes)
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE talhoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens        ENABLE ROW LEVEL SECURITY;

-- Tabelas não sensíveis — sem restrição (lookup públicos para o app funcionar)
-- implement_adjustments, etc., são acessadas apenas via service_role

-- ── Políticas: negar tudo para anon/authenticated via anon key ────────────
-- O service_role bypassa estas políticas completamente.

-- users: apenas o próprio usuário pode ver seu registro via anon key
CREATE POLICY IF NOT EXISTS "users: only self via anon"
  ON users FOR SELECT
  USING (false);  -- bloqueia tudo via anon; service_role bypassa

CREATE POLICY IF NOT EXISTS "farms: block direct anon access"
  ON farms FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "farm_users: block direct anon access"
  ON farm_users FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "talhoes: block direct anon access"
  ON talhoes FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "insumos: block direct anon access"
  ON insumos FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "transactions: block direct anon access"
  ON transactions FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "audit_log: block direct anon access"
  ON audit_log FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "report_schedules: block direct anon access"
  ON report_schedules FOR ALL
  USING (false);

CREATE POLICY IF NOT EXISTS "push_tokens: block direct anon access"
  ON push_tokens FOR ALL
  USING (false);
