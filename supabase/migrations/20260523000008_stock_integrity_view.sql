-- Migration: view de diagnóstico de integridade de estoque
--
-- Permite identificar insumos onde o campo quantity diverge do valor computado
-- a partir das transactions (invariante: quantity = SUM(entrada) - SUM(saida)).
--
-- Uso no SQL Editor do Supabase:
--   SELECT * FROM v_stock_integrity WHERE ABS(discrepancy) > 0.001 ORDER BY ABS(discrepancy) DESC;

CREATE OR REPLACE VIEW v_stock_integrity AS
SELECT
  i.id,
  i.farm_id,
  f.name                                    AS farm_name,
  i.title,
  i.unit,
  i.quantity                                AS stored_qty,
  COALESCE(SUM(
    CASE
      WHEN t.type = 'entrada' THEN  t.quantity
      WHEN t.type = 'saida'   THEN -t.quantity
      ELSE 0
    END
  ), 0)                                     AS computed_qty,
  i.quantity - COALESCE(SUM(
    CASE
      WHEN t.type = 'entrada' THEN  t.quantity
      WHEN t.type = 'saida'   THEN -t.quantity
      ELSE 0
    END
  ), 0)                                     AS discrepancy,
  COUNT(t.id)                               AS transaction_count
FROM  insumos i
JOIN  farms f ON f.id = i.farm_id
LEFT JOIN transactions t ON t.insumo_id = i.id
GROUP BY i.id, i.farm_id, f.name, i.title, i.unit, i.quantity;

COMMENT ON VIEW v_stock_integrity IS
  'Compara estoque armazenado com o valor calculado das transactions. '
  'discrepancy != 0 indica corrupção de dados.';
