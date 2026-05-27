-- Token version para invalidacao imediata de sessao quando role muda.
--
-- Quando admin altera o cargo de um usuario:
--   1. UPDATE users SET token_version = token_version + 1
--   2. verifyToken compara JWT.tv com users.token_version
--   3. Se diferentes, sessao e rejeitada -> usuario forcado a relogar
--      -> novo JWT carrega a role atualizada
--
-- Sem isso, JWT antigo persiste ate 7 dias com privilegios desatualizados
-- (cenario critico: admin demote->operario continua com acesso admin).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.token_version IS
  'Incrementado sempre que a sessao do usuario deve ser invalidada (ex: mudanca de cargo). JWTs com tv menor sao rejeitados em verifyToken.';
