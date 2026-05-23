-- Migration: corrige comportamento ON DELETE das FKs problemáticas
--
-- Problema 1: farms.owner_id sem ON DELETE → rejeita DELETE de usuário admin que possui fazendas
-- Solução: SET NULL (fazenda fica órfã, aguarda claim)
--
-- Problema 2: implement_adjustments.user_id sem ON DELETE → rejeita DELETE de qualquer usuário
--   com regulagens registradas
-- Solução: SET NULL (preserva o registro histórico, apenas perde a referência ao autor)

-- 1. farms.owner_id
ALTER TABLE farms DROP CONSTRAINT IF EXISTS farms_owner_id_fkey;
ALTER TABLE farms
  ADD CONSTRAINT farms_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. implement_adjustments.user_id
ALTER TABLE implement_adjustments DROP CONSTRAINT IF EXISTS implement_adjustments_user_id_fkey;
ALTER TABLE implement_adjustments
  ADD CONSTRAINT implement_adjustments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
