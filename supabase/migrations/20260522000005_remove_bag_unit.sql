-- Remove unidade "bag" do sistema: converte todas as sacas para kg (1 bag = 1000 kg)
UPDATE insumos
SET
  quantity     = quantity * 1000,
  min_quantity = CASE WHEN min_quantity IS NOT NULL THEN min_quantity * 1000 ELSE NULL END,
  unit         = 'kg'
WHERE unit = 'bag';
