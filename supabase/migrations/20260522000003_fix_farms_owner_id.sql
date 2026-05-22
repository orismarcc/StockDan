-- Corrige fazendas com owner_id = NULL.
-- Estratégia: atribui ao admin que mais transações tem naquela fazenda.
-- Fallback: admin mais antigo cadastrado no sistema.

DO $$
DECLARE
  v_oldest_admin UUID;
BEGIN
  -- Admin mais antigo como fallback
  SELECT id INTO v_oldest_admin
  FROM users
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  -- Para cada fazenda sem dono, tenta encontrar o admin com mais transações
  UPDATE farms f
  SET owner_id = COALESCE(
    (
      SELECT u.id
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.farm_id = f.id
        AND u.role = 'admin'
      GROUP BY u.id
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),
    v_oldest_admin
  )
  WHERE f.owner_id IS NULL;
END;
$$;
