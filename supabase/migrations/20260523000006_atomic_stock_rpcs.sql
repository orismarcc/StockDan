-- Migration: RPCs atômicas para todas as operações de estoque
--
-- PROBLEMA CENTRAL: UPDATE insumos + INSERT transactions são dois round-trips
-- separados sem transação DB. Falha entre os dois = estoque corrompido sem trilha.
--
-- SOLUÇÃO: PostgreSQL functions com SELECT FOR UPDATE (lock pessimista por linha)
-- e ambas as escritas dentro da mesma transação PL/pgSQL.
--
-- Funções criadas:
--   registrar_saida(...)        → saída de estoque + transaction record
--   registrar_entrada(...)      → entrada de estoque + transaction record
--   ajustar_estoque(...)        → ajuste manual de estoque + transaction de ajuste
--   editar_transacao(...)       → edita quantidade/data de transação existente + ajusta estoque
--   excluir_transacao(...)      → exclui transação + restaura estoque
--   criar_insumo(...)           → cria insumo + transaction de estoque inicial


-- ────────────────────────────────────────────────────────────────────────────────
-- 1. registrar_saida
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_saida(
  p_farm_id    UUID,
  p_insumo_id  UUID,
  p_talhao_id  UUID,
  p_user_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_notes      TEXT    DEFAULT NULL,
  p_area_ha    NUMERIC DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock  NUMERIC;
  v_new_q  NUMERIC;
  v_tx_id  UUID;
BEGIN
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

  INSERT INTO transactions (farm_id, insumo_id, talhao_id, user_id, type, quantity, date, notes, area_ha)
  VALUES (p_farm_id, p_insumo_id, p_talhao_id, p_user_id, 'saida', p_quantity, p_date, p_notes, p_area_ha)
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
END;
$$;

COMMENT ON FUNCTION registrar_saida IS
  'Registra saída de estoque atomicamente: UPDATE insumos + INSERT transactions em uma transação.';


-- ────────────────────────────────────────────────────────────────────────────────
-- 2. registrar_entrada
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_entrada(
  p_farm_id    UUID,
  p_insumo_id  UUID,
  p_user_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_notes      TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock  NUMERIC;
  v_new_q  NUMERIC;
  v_tx_id  UUID;
BEGIN
  SELECT quantity INTO v_stock
  FROM   insumos
  WHERE  id = p_insumo_id AND farm_id = p_farm_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUMO_NOT_FOUND';
  END IF;

  v_new_q := v_stock + p_quantity;

  UPDATE insumos SET quantity = v_new_q WHERE id = p_insumo_id;

  INSERT INTO transactions (farm_id, insumo_id, talhao_id, user_id, type, quantity, date, notes)
  VALUES (p_farm_id, p_insumo_id, NULL, p_user_id, 'entrada', p_quantity, p_date, p_notes)
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'new_quantity', v_new_q);
END;
$$;

COMMENT ON FUNCTION registrar_entrada IS
  'Registra entrada de estoque atomicamente: UPDATE insumos + INSERT transactions em uma transação.';


-- ────────────────────────────────────────────────────────────────────────────────
-- 3. ajustar_estoque
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ajustar_estoque(
  p_insumo_id  UUID,
  p_farm_id    UUID,
  p_user_id    UUID,
  p_new_qty    NUMERIC,
  p_notes      TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_qty NUMERIC;
  v_delta   NUMERIC;
  v_tx_id   UUID;
BEGIN
  IF p_new_qty < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_STOCK';
  END IF;

  SELECT quantity INTO v_old_qty
  FROM   insumos
  WHERE  id = p_insumo_id AND farm_id = p_farm_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUMO_NOT_FOUND';
  END IF;

  UPDATE insumos SET quantity = p_new_qty WHERE id = p_insumo_id;

  v_delta := p_new_qty - v_old_qty;

  IF ABS(v_delta) > 0.0001 THEN
    INSERT INTO transactions (farm_id, insumo_id, user_id, type, quantity, date, notes)
    VALUES (
      p_farm_id, p_insumo_id, p_user_id,
      CASE WHEN v_delta > 0 THEN 'entrada' ELSE 'saida' END,
      ABS(v_delta),
      CURRENT_DATE,
      COALESCE('Ajuste manual' || CASE WHEN p_notes IS NOT NULL THEN ': ' || p_notes ELSE '' END, 'Ajuste manual')
    )
    RETURNING id INTO v_tx_id;
  END IF;

  RETURN json_build_object('new_quantity', p_new_qty, 'transaction_id', v_tx_id);
END;
$$;

COMMENT ON FUNCTION ajustar_estoque IS
  'Ajusta estoque para valor absoluto e registra transação de ajuste. Atômico.';


-- ────────────────────────────────────────────────────────────────────────────────
-- 4. editar_transacao
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION editar_transacao(
  p_tid        UUID,
  p_farm_id    UUID,
  p_quantity   NUMERIC,
  p_date       DATE,
  p_talhao_id  UUID    DEFAULT NULL,
  p_notes      TEXT    DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx        transactions%ROWTYPE;
  v_stock     NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  -- Lock na transação e no insumo (ordem consistente evita deadlock)
  SELECT * INTO v_tx
  FROM   transactions
  WHERE  id = p_tid AND farm_id = p_farm_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TX_NOT_FOUND';
  END IF;

  SELECT quantity INTO v_stock
  FROM   insumos
  WHERE  id = v_tx.insumo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUMO_NOT_FOUND';
  END IF;

  -- Calcula novo estoque: desfaz o efeito antigo, aplica o novo
  v_new_stock := CASE v_tx.type
    WHEN 'saida'   THEN v_stock + v_tx.quantity - p_quantity
    WHEN 'entrada' THEN v_stock - v_tx.quantity + p_quantity
  END;

  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_stock;
  END IF;

  UPDATE insumos SET quantity = v_new_stock WHERE id = v_tx.insumo_id;

  UPDATE transactions
  SET    quantity  = p_quantity,
         date      = p_date,
         talhao_id = COALESCE(p_talhao_id, v_tx.talhao_id),
         notes     = p_notes
  WHERE  id = p_tid;

  RETURN json_build_object('transaction_id', p_tid, 'new_quantity', v_new_stock);
END;
$$;

COMMENT ON FUNCTION editar_transacao IS
  'Edita quantidade/data de transação e ajusta estoque atomicamente.';


-- ────────────────────────────────────────────────────────────────────────────────
-- 5. excluir_transacao
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION excluir_transacao(
  p_tid     UUID,
  p_farm_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx      transactions%ROWTYPE;
  v_stock   NUMERIC;
  v_restored NUMERIC;
BEGIN
  SELECT * INTO v_tx
  FROM   transactions
  WHERE  id = p_tid AND farm_id = p_farm_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TX_NOT_FOUND';
  END IF;

  SELECT quantity INTO v_stock
  FROM   insumos
  WHERE  id = v_tx.insumo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUMO_NOT_FOUND';
  END IF;

  v_restored := CASE v_tx.type
    WHEN 'saida'   THEN v_stock + v_tx.quantity
    WHEN 'entrada' THEN v_stock - v_tx.quantity
  END;

  IF v_restored < 0 THEN
    RAISE EXCEPTION 'STOCK_WOULD_BE_NEGATIVE';
  END IF;

  UPDATE insumos SET quantity = v_restored WHERE id = v_tx.insumo_id;

  DELETE FROM transactions WHERE id = p_tid;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION excluir_transacao IS
  'Exclui transação e restaura estoque atomicamente.';


-- ────────────────────────────────────────────────────────────────────────────────
-- 6. criar_insumo
-- ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION criar_insumo(
  p_farm_id      UUID,
  p_user_id      UUID,
  p_title        TEXT,
  p_description  TEXT    DEFAULT NULL,
  p_unit         TEXT    DEFAULT 'kg',
  p_quantity     NUMERIC DEFAULT 0,
  p_min_quantity NUMERIC DEFAULT NULL,
  p_date         DATE    DEFAULT CURRENT_DATE
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_insumo insumos%ROWTYPE;
BEGIN
  INSERT INTO insumos (farm_id, title, description, unit, quantity, min_quantity)
  VALUES (p_farm_id, p_title, p_description, p_unit, p_quantity, p_min_quantity)
  RETURNING * INTO v_insumo;

  IF p_quantity > 0 THEN
    INSERT INTO transactions (farm_id, insumo_id, user_id, type, quantity, date, notes)
    VALUES (p_farm_id, v_insumo.id, p_user_id, 'entrada', p_quantity, p_date, 'Estoque inicial');
  END IF;

  RETURN row_to_json(v_insumo);
END;
$$;

COMMENT ON FUNCTION criar_insumo IS
  'Cria insumo e registra estoque inicial atomicamente. Retorna o row do insumo criado.';
