-- Migration: corrige ON DELETE de implement_adjustments.talhao_id
--
-- Problema: talhao_id tinha ON DELETE CASCADE → ao deletar um talhão, todos os
-- registros de regulagem de implemento eram destruídos silenciosamente.
-- Comportamento inconsistente com transactions.talhao_id que usa SET NULL.
--
-- Solução: SET NULL (preserva o histórico de regulagem, apenas perde a referência ao talhão)
-- talhao_id passa a ser nullable.

ALTER TABLE implement_adjustments DROP CONSTRAINT IF EXISTS implement_adjustments_talhao_id_fkey;

ALTER TABLE implement_adjustments ALTER COLUMN talhao_id DROP NOT NULL;

ALTER TABLE implement_adjustments
  ADD CONSTRAINT implement_adjustments_talhao_id_fkey
  FOREIGN KEY (talhao_id) REFERENCES talhoes(id) ON DELETE SET NULL;

COMMENT ON COLUMN implement_adjustments.talhao_id IS 'Referência ao talhão. NULL se o talhão foi excluído (histórico preservado).';
