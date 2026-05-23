-- Migration: Idempotência para operações offline
--
-- PROBLEMA: operários em campo com conexão instável podem ter a mesma operação
-- sincronizada múltiplas vezes (retry após timeout), duplicando transações e
-- corrompendo o estoque.
--
-- SOLUÇÃO: coluna offline_id em transactions com índice UNIQUE parcial (WHERE NOT NULL)
-- + parâmetro p_offline_id na RPC registrar_saida para checagem atômica.
--
-- O cliente gera um UUID v4 por operação e o envia em toda tentativa de POST.
-- O servidor retorna a transação existente se já processada (idempotente).

-- 1. Adiciona coluna ao histórico existente
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS offline_id TEXT;

COMMENT ON COLUMN transactions.offline_id IS
  'Chave de idempotência para operações offline. NULL = operação online direta.';

-- 2. Índice UNIQUE parcial — só cobre linhas com offline_id preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_offline_id
  ON transactions (offline_id)
  WHERE offline_id IS NOT NULL;

-- 3. Atualiza registrar_saida para aceitar e persistir offline_id
CREATE OR REPLACE FUNCTION registrar_saida(
  p_farm_id    UUID,
  p_insumo_id  UUID,
  p_talhao_id  UUID,
  p_user_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_notes      TEXT    DEFAULT NULL,
  p_area_ha    NUMERIC DEFAULT NULL,
  p_offline_id TEXT    DEFAULT NULL
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

  INSERT INTO transactions (farm_id, insumo_id, talhao_id, user_id, type, quantity, date, notes, area_ha, offline_id)
  VALUES (p_farm_id, p_insumo_id, p_talhao_id, p_user_id, 'saida', p_quantity, p_date, p_notes, p_area_ha, p_offline_id)
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
END;
$$;

COMMENT ON FUNCTION registrar_saida IS
  'Registra saída de estoque atomicamente. Aceita p_offline_id para idempotência em operações offline.';
