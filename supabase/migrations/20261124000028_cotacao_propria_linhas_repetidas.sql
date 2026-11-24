-- A cotação própria fica exatamente como o relatório do sistema da farmácia:
-- o mesmo produto pode vir em mais de uma linha (quem pediu separou por algum
-- motivo) e cada linha é um item, sem somar. O código deixa de ser único
-- dentro da cotação; o índice continua para as buscas por código.
ALTER TABLE public.cotacao_propria_itens
  DROP CONSTRAINT IF EXISTS cotacao_propria_itens_cotacao_propria_id_codigo_key;

CREATE INDEX IF NOT EXISTS cotacao_propria_itens_codigo_idx
  ON public.cotacao_propria_itens (cotacao_propria_id, codigo);
