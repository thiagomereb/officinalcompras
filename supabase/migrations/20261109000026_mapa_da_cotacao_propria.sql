-- O mapa de cotação passa a ser de uma cotação própria: compara os orçamentos
-- dela. Em rascunho, a lista de orçamentos é lida na hora (entra o que chegar
-- depois); na aprovação, cotacoes_ids guarda os que foram comparados.
-- Excluir a cotação própria leva junto os mapas em rascunho; o mapa aprovado
-- tem trava contra exclusão, então ele impede a exclusão da cotação.
ALTER TABLE public.mapas_cotacao
  ADD COLUMN IF NOT EXISTS cotacao_propria_id uuid REFERENCES public.cotacoes_proprias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS mapas_cotacao_cotacao_propria_idx ON public.mapas_cotacao (cotacao_propria_id);
