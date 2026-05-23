-- Migration: trigger de validação cross-farm em transactions
--
-- Problema: a nível de DB não há nada que impeça uma transação de referenciar
-- um insumo ou talhão de outra fazenda. A validação existe só no app level.
-- Acesso direto ao Supabase Dashboard ou bug futuro poderia criar dados corrompidos.
--
-- Este trigger garante que:
--   transactions.insumo_id.farm_id = transactions.farm_id
--   transactions.talhao_id.farm_id = transactions.farm_id  (quando não NULL)

CREATE OR REPLACE FUNCTION validate_transaction_farm_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Valida que o insumo pertence à fazenda da transação
  IF NOT EXISTS (
    SELECT 1 FROM insumos WHERE id = NEW.insumo_id AND farm_id = NEW.farm_id
  ) THEN
    RAISE EXCEPTION 'Integridade violada: insumo % não pertence à fazenda %',
      NEW.insumo_id, NEW.farm_id;
  END IF;

  -- Valida que o talhão pertence à fazenda da transação (se informado)
  IF NEW.talhao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM talhoes WHERE id = NEW.talhao_id AND farm_id = NEW.farm_id
  ) THEN
    RAISE EXCEPTION 'Integridade violada: talhão % não pertence à fazenda %',
      NEW.talhao_id, NEW.farm_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transaction_farm ON transactions;

CREATE TRIGGER trg_validate_transaction_farm
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION validate_transaction_farm_consistency();

COMMENT ON FUNCTION validate_transaction_farm_consistency IS
  'Garante que insumo_id e talhao_id de uma transaction pertencem à mesma fazenda que farm_id.';
