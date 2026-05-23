-- Migration: constraints UNIQUE para evitar nomes duplicados por fazenda
--
-- Insumos duplicados causam confusão nos relatórios (dois "Ureia" no mesmo dropdown).
-- Talhões duplicados criam ambiguidade nos registros de retirada.
--
-- Guards: só aplica a constraint se não existirem duplicatas já na base.
-- Se duplicatas existirem, a migration emite NOTICE e continua (sem falhar).
-- Nesse caso, resolver manualmente via SQL Editor antes de re-executar.

DO $$
BEGIN
  -- ── insumos: (farm_id, title) único ────────────────────────────────────────
  IF EXISTS (
    SELECT farm_id, title FROM insumos GROUP BY farm_id, title HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'SKIP uq_insumo_title_per_farm: títulos duplicados encontrados. '
                 'Resolva com: SELECT farm_id, title, COUNT(*) FROM insumos GROUP BY farm_id, title HAVING COUNT(*) > 1;';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_insumo_title_per_farm'
  ) THEN
    ALTER TABLE insumos ADD CONSTRAINT uq_insumo_title_per_farm UNIQUE (farm_id, title);
    RAISE NOTICE 'OK uq_insumo_title_per_farm criada.';
  ELSE
    RAISE NOTICE 'OK uq_insumo_title_per_farm já existe.';
  END IF;

  -- ── talhoes: (farm_id, name) único ─────────────────────────────────────────
  IF EXISTS (
    SELECT farm_id, name FROM talhoes GROUP BY farm_id, name HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'SKIP uq_talhao_name_per_farm: nomes duplicados encontrados. '
                 'Resolva com: SELECT farm_id, name, COUNT(*) FROM talhoes GROUP BY farm_id, name HAVING COUNT(*) > 1;';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_talhao_name_per_farm'
  ) THEN
    ALTER TABLE talhoes ADD CONSTRAINT uq_talhao_name_per_farm UNIQUE (farm_id, name);
    RAISE NOTICE 'OK uq_talhao_name_per_farm criada.';
  ELSE
    RAISE NOTICE 'OK uq_talhao_name_per_farm já existe.';
  END IF;
END $$;
