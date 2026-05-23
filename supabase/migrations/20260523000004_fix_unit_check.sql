-- Migration: corrige CHECK constraint de unit em insumos
--
-- Situação: migration 005 converteu todos os dados bag → kg mas NÃO alterou o CHECK.
-- O CHECK ainda permite unit = 'bag', então INSERT direto via Dashboard poderia
-- reintroduzir bag no sistema. A API valida unit = 'kg' mas a DB é a última linha de defesa.

ALTER TABLE insumos DROP CONSTRAINT IF EXISTS insumos_unit_check;
ALTER TABLE insumos ADD CONSTRAINT insumos_unit_check CHECK (unit = 'kg');

COMMENT ON COLUMN insumos.unit IS 'Sempre kg. Unidade bag foi removida na migration 20260522000005.';
