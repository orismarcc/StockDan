-- Migration: adiciona area_ha em transactions para registrar hectares aplicados por retirada
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS area_ha NUMERIC(10, 4);
