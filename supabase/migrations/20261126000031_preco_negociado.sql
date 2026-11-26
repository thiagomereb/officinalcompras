-- O comprador negocia com o fornecedor depois do orçamento: o preço combinado
-- fica ao lado do que veio no documento (preco_unitario continua sendo o do
-- orçamento). Mapa, sugestão, aprovação e ordem de compra usam o negociado
-- quando houver. Preço da embalagem, como preco_unitario.
ALTER TABLE public.cotacao_itens
  ADD COLUMN IF NOT EXISTS preco_negociado numeric CHECK (preco_negociado > 0),
  ADD COLUMN IF NOT EXISTS negociado_em timestamptz,
  ADD COLUMN IF NOT EXISTS negociado_por text;
