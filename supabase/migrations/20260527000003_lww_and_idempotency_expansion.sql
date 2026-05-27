-- Migration: LWW columns + registrar_entrada idempotency
--
-- Expande os padroes ja estabelecidos para todas as tabelas mutaveis:
--
-- 1. updated_at_client em transactions/insumos/talhoes/farms:
--    Permite resolucao LWW (last-write-wins) quando dois usuarios editam o
--    mesmo registro. O cliente envia timestamp do momento da edicao no body
--    do PATCH; servidor compara com seu proprio updated_at e ignora se ja
--    foi modificado depois.
--
-- 2. registrar_entrada agora aceita p_offline_id para idempotencia:
--    Protege contra duplicacao de entrada de estoque por retry de timeout
--    do navegador (admin clica e nao chega resposta -> retentar nao duplica).

-- ── 1. updated_at_client em multiplas tabelas ───────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS updated_at_client TIMESTAMPTZ;
COMMENT ON COLUMN transactions.updated_at_client IS
  'Timestamp da edicao no cliente. Usado para LWW em PATCH (cliente vence se valor > server.updated_at).';

ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS updated_at_client TIMESTAMPTZ;
COMMENT ON COLUMN insumos.updated_at_client IS
  'Timestamp da edicao no cliente. Usado para LWW em PATCH.';

ALTER TABLE talhoes
  ADD COLUMN IF NOT EXISTS updated_at_client TIMESTAMPTZ;
COMMENT ON COLUMN talhoes.updated_at_client IS
  'Timestamp da edicao no cliente. Usado para LWW em PATCH.';

ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS updated_at_client TIMESTAMPTZ;
COMMENT ON COLUMN farms.updated_at_client IS
  'Timestamp da edicao no cliente. Usado para LWW em PATCH.';

-- ── 2. registrar_entrada com idempotencia via offline_id ────────────────────
-- offline_id ja existe em transactions (migration 23000009 ja criou coluna e indice unico)

DROP FUNCTION IF EXISTS registrar_entrada(UUID, UUID, UUID, NUMERIC, DATE, TEXT);

CREATE OR REPLACE FUNCTION registrar_entrada(
  p_farm_id    UUID,
  p_insumo_id  UUID,
  p_user_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_notes      TEXT DEFAULT NULL,
  p_offline_id TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock  NUMERIC;
  v_new_q  NUMERIC;
  v_tx_id  UUID;
BEGIN
  -- Idempotencia: se ja existe transacao com este offline_id, retorna sem duplicar
  IF p_offline_id IS NOT NULL THEN
    SELECT id INTO v_tx_id
    FROM   transactions
    WHERE  offline_id = p_offline_id
    LIMIT  1;

    IF FOUND THEN
      SELECT quantity INTO v_new_q FROM insumos WHERE id = p_insumo_id;
      RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
    END IF;
  END IF;

  -- Lock pessimista no insumo (mesmo padrao de registrar_saida)
  SELECT quantity INTO v_stock
  FROM   insumos
  WHERE  id = p_insumo_id AND farm_id = p_farm_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUMO_NOT_FOUND';
  END IF;

  v_new_q := v_stock + p_quantity;

  UPDATE insumos SET quantity = v_new_q WHERE id = p_insumo_id;

  INSERT INTO transactions (farm_id, insumo_id, user_id, type, quantity, date, notes, offline_id)
  VALUES (p_farm_id, p_insumo_id, p_user_id, 'entrada', p_quantity, p_date, p_notes, p_offline_id)
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
END;
$$;

COMMENT ON FUNCTION registrar_entrada IS
  'Registra entrada de estoque atomicamente. Aceita p_offline_id para idempotencia.';
