-- Migration: created_at do cliente em registros offline
--
-- PROBLEMA: quando o operário registra offline e o dispositivo sincroniza horas
-- depois, o servidor insere a transação com created_at = NOW() (hora da sync),
-- não a hora real do registro.
--
-- SOLUÇÃO: ambas as RPCs aceitam p_created_at TIMESTAMPTZ DEFAULT NOW().
-- O cliente envia o timestamp capturado no momento do submit; se omitido (calls
-- legados), o servidor usa NOW() como antes — totalmente backward-compatible.
--
-- O API route valida o valor recebido (range: últimos 7 dias até +1 minuto)
-- e cai no NOW() se inválido, para não abrir vetor de manipulação de histórico.

-- ── registrar_saida (retiradas) ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS registrar_saida(UUID, UUID, UUID, UUID, NUMERIC, DATE, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION registrar_saida(
  p_farm_id    UUID,
  p_insumo_id  UUID,
  p_talhao_id  UUID,
  p_user_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_notes      TEXT        DEFAULT NULL,
  p_area_ha    NUMERIC     DEFAULT NULL,
  p_offline_id TEXT        DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock  NUMERIC;
  v_new_q  NUMERIC;
  v_tx_id  UUID;
BEGIN
  -- Idempotência: se já existe transação com este offline_id, retorna sem duplicar
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

  -- Lock pessimista na linha do insumo para serializar escritas concorrentes
  SELECT quantity INTO v_stock
  FROM   insumos
  WHERE  id = p_insumo_id AND farm_id = p_farm_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUMO_NOT_FOUND';
  END IF;

  IF v_stock < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_stock;
  END IF;

  v_new_q := v_stock - p_quantity;

  UPDATE insumos SET quantity = v_new_q WHERE id = p_insumo_id;

  INSERT INTO transactions
    (farm_id, insumo_id, talhao_id, user_id, type, quantity, date, notes, area_ha, offline_id, created_at)
  VALUES
    (p_farm_id, p_insumo_id, p_talhao_id, p_user_id, 'saida', p_quantity, p_date, p_notes, p_area_ha, p_offline_id, p_created_at)
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
END;
$$;

COMMENT ON FUNCTION registrar_saida IS
  'Registra saída de estoque atomicamente. p_offline_id = idempotência offline. p_created_at = timestamp do cliente (preserva hora real do registro offline).';

-- ── registrar_entrada (entradas de estoque) ──────────────────────────────────

DROP FUNCTION IF EXISTS registrar_entrada(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT);

CREATE OR REPLACE FUNCTION registrar_entrada(
  p_farm_id    UUID,
  p_insumo_id  UUID,
  p_user_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_notes      TEXT        DEFAULT NULL,
  p_offline_id TEXT        DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
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

  INSERT INTO transactions
    (farm_id, insumo_id, user_id, type, quantity, date, notes, offline_id, created_at)
  VALUES
    (p_farm_id, p_insumo_id, p_user_id, 'entrada', p_quantity, p_date, p_notes, p_offline_id, p_created_at)
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
END;
$$;

COMMENT ON FUNCTION registrar_entrada IS
  'Registra entrada de estoque atomicamente. p_offline_id = idempotência. p_created_at = timestamp do cliente.';
