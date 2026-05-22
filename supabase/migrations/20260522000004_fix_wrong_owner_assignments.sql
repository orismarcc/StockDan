-- Reverte atribuições automáticas incorretas feitas pela migration 20260522000003.
-- Uma fazenda foi mal atribuída se o admin designado nunca realizou
-- NENHUMA transação nessa fazenda (foi atribuído apenas pelo fallback "admin mais antigo").
-- Essas fazendas voltam para owner_id = NULL para serem reivindicadas manualmente.

UPDATE farms f
SET owner_id = NULL
WHERE f.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM transactions t
    WHERE t.farm_id = f.id
      AND t.user_id = f.owner_id
  );
