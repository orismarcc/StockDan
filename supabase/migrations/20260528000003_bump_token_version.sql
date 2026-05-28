-- Migration: força re-login de todos os usuários com token stale.
--
-- Contexto: a migration 20260527000005_user_roles_hierarchy fez backfill
-- direto no banco (admin → gestor) sem incrementar token_version.
-- Resultado: cookies emitidos antes da migration ainda carregam role='admin',
-- fazendo o dashboard cair na branch errada e não mostrar fazendas.
--
-- Este bump invalida todos os JWTs atuais. Na próxima tentativa de página,
-- getSession() detecta token_version < DB e redireciona para /login.
-- O próximo login gera token com role e gestor_id corretos.

UPDATE users
SET token_version = COALESCE(token_version, 0) + 1;
