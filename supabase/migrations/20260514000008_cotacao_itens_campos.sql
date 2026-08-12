ALTER TABLE public.cotacao_itens
  ADD COLUMN IF NOT EXISTS pais_origem  text,
  ADD COLUMN IF NOT EXISTS quantidade   numeric(12,4),
  ADD COLUMN IF NOT EXISTS ipi          numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS st           numeric(6,2) DEFAULT 0;
