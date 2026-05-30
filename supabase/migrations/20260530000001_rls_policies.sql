-- Migration: Row Level Security (RLS) — defesa em profundidade
--
-- PROBLEMA: sem RLS, acesso direto ao banco via anon key exporia dados
-- de todos os tenants. RLS bloqueia acesso externo mesmo que alguém
-- obtenha a URL do Supabase + anon key.
--
-- ABORDAGEM: habilitar RLS em todas as tabelas sensíveis. O service_role
-- key (usado pelo servidor Next.js) bypassa RLS por design — a aplicação
-- não é afetada. Protege contra acesso direto externo.
--
-- Nota: usa DO $$ para compatibilidade com PostgreSQL 14+ (sem IF NOT EXISTS
-- para CREATE POLICY, que só existe no PG 15).

-- Habilitar RLS
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE talhoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens      ENABLE ROW LEVEL SECURITY;

-- Criar políticas deny-all para anon key (compatível com PG 14+)
-- Service role bypassa completamente — sem impacto na aplicação.
DO $$
DECLARE
  tbl TEXT;
  pol TEXT;
BEGIN
  FOR tbl, pol IN VALUES
    ('users',            'stockdan_rls_users'),
    ('farms',            'stockdan_rls_farms'),
    ('farm_users',       'stockdan_rls_farm_users'),
    ('talhoes',          'stockdan_rls_talhoes'),
    ('insumos',          'stockdan_rls_insumos'),
    ('transactions',     'stockdan_rls_transactions'),
    ('audit_log',        'stockdan_rls_audit_log'),
    ('report_schedules', 'stockdan_rls_report_schedules'),
    ('push_tokens',      'stockdan_rls_push_tokens')
  LOOP
    -- Só cria se não existir (compatível com PG 14+)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = pol
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (false)',
        pol, tbl
      );
    END IF;
  END LOOP;
END $$;
