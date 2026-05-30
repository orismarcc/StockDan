-- Migration: Perfil de usuário — campo age
--
-- PROBLEMA: usuários não têm campo de idade disponível.
-- SOLUÇÃO: adicionar coluna age (SMALLINT, nullable) à tabela users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS age SMALLINT;

COMMENT ON COLUMN users.age IS 'Idade do usuário em anos. Opcional.';
