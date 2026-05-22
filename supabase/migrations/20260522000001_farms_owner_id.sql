-- Migration: isolamento de fazendas por admin
-- owner_id NULL = fazenda legada, visível a todos os admins
ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
