-- O CAS saiu do sistema (decisão de 06/11/2026): o cadastro de insumos nunca
-- teve CAS preenchido e os itens de cotação só tinham dois. Aplicar só depois
-- do deploy do app que não lê nem grava mais essas colunas.
ALTER TABLE public.cotacao_itens DROP COLUMN IF EXISTS cas;

-- Leva junto a restrição UNIQUE da coluna
ALTER TABLE public.insumos DROP COLUMN IF EXISTS cas_number;
