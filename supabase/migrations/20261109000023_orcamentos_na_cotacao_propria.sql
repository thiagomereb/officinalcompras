-- Etapa 2 do novo fluxo: os orçamentos dos fornecedores (tabela cotacoes)
-- passam a viver dentro de uma cotação própria, e cada item do orçamento aponta
-- para o produto pedido que ele atende.

-- As cotações e o mapa do fluxo antigo eram de teste e o usuário autorizou
-- apagar (08/11/2026). A trava do mapa aprovado é desligada só para isso.
ALTER TABLE public.mapa_cotacao_itens DISABLE TRIGGER proteger_itens_mapa_aprovado;
ALTER TABLE public.mapas_cotacao DISABLE TRIGGER proteger_mapa_aprovado;
DELETE FROM public.mapa_cotacao_itens;
DELETE FROM public.mapas_cotacao;
ALTER TABLE public.mapa_cotacao_itens ENABLE TRIGGER proteger_itens_mapa_aprovado;
ALTER TABLE public.mapas_cotacao ENABLE TRIGGER proteger_mapa_aprovado;
DELETE FROM public.cotacoes; -- os itens saem junto (on delete cascade)

ALTER TABLE public.cotacoes
  ADD COLUMN IF NOT EXISTS cotacao_propria_id uuid REFERENCES public.cotacoes_proprias(id) ON DELETE CASCADE,
  -- Número do orçamento no documento do fornecedor ("QUO-1733636-L5F9L1", "AABC66")
  ADD COLUMN IF NOT EXISTS numero_orcamento text,
  -- Validade como o fornecedor escreve ("2 dias", "1 dia após o envio")
  ADD COLUMN IF NOT EXISTS validade_texto text,
  ADD COLUMN IF NOT EXISTS frete_tipo text CHECK (frete_tipo IN ('CIF', 'FOB')),
  -- Total impresso no documento, para conferir se a leitura pegou todos os itens
  ADD COLUMN IF NOT EXISTS total_documento numeric;
ALTER TABLE public.cotacoes ALTER COLUMN cotacao_propria_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS cotacoes_cotacao_propria_idx ON public.cotacoes (cotacao_propria_id);

ALTER TABLE public.cotacao_itens
  ADD COLUMN IF NOT EXISTS cotacao_propria_item_id uuid REFERENCES public.cotacao_propria_itens(id) ON DELETE SET NULL,
  -- Ressalva da leitura sobre o vínculo (forma, teor ou sal diferentes)
  ADD COLUMN IF NOT EXISTS vinculo_obs text,
  -- 'ia': sugestão da leitura, a conferir; 'sinonimo': descrição já confirmada
  -- antes; 'comprador': conferido ou escolhido à mão
  ADD COLUMN IF NOT EXISTS vinculo_origem text CHECK (vinculo_origem IN ('ia', 'sinonimo', 'comprador'));
CREATE INDEX IF NOT EXISTS cotacao_itens_pedido_idx ON public.cotacao_itens (cotacao_propria_item_id);

-- Grava de uma vez as descrições confirmadas pelo comprador como sinônimos do
-- insumo, para a próxima leitura já vir certa. A mesma descrição apontando para
-- outro insumo era a causa do vínculo errado e sai de lá.
CREATE OR REPLACE FUNCTION public.aprender_sinonimos(p_pares jsonb)
RETURNS integer
LANGUAGE sql
AS $$
  WITH pares AS (
    SELECT DISTINCT ON (upper(t.texto))
      t.texto, (p ->> 'insumo_id')::uuid AS insumo_id
    FROM jsonb_array_elements(p_pares) p
    CROSS JOIN LATERAL (SELECT left(regexp_replace(trim(p ->> 'descricao'), '\s+', ' ', 'g'), 200) AS texto) t
    WHERE t.texto <> ''
  ), removidos AS (
    DELETE FROM public.insumo_sinonimos s
    USING pares
    WHERE upper(s.sinonimo) = upper(pares.texto) AND s.insumo_id <> pares.insumo_id
    RETURNING 1
  ), inseridos AS (
    INSERT INTO public.insumo_sinonimos (insumo_id, sinonimo)
    SELECT pares.insumo_id, pares.texto
    FROM pares
    JOIN public.insumos i ON i.id = pares.insumo_id
    WHERE upper(trim(i.nome_padrao)) <> upper(pares.texto)
      AND NOT EXISTS (
        SELECT 1 FROM public.insumo_sinonimos s
        WHERE s.insumo_id = pares.insumo_id AND upper(s.sinonimo) = upper(pares.texto)
      )
    RETURNING 1
  )
  SELECT count(*)::integer FROM inseridos;
$$;

REVOKE EXECUTE ON FUNCTION public.aprender_sinonimos(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aprender_sinonimos(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprender_sinonimos(jsonb) TO authenticated;
