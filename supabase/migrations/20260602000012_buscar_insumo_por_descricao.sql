-- Habilita pg_trgm se ainda não estiver ativo
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices trigram para busca rápida
CREATE INDEX IF NOT EXISTS idx_insumos_nome_trgm
  ON public.insumos USING gin (upper(nome_padrao) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_insumo_sinonimos_trgm
  ON public.insumo_sinonimos USING gin (upper(sinonimo) gin_trgm_ops);

-- Função unificada: busca em nome_padrao + sinônimos, retorna melhor match
CREATE OR REPLACE FUNCTION public.buscar_insumo_por_descricao(
  p_descricao text,
  p_limite     int DEFAULT 1
)
RETURNS TABLE(insumo_id uuid, nome_padrao text, similaridade float4)
LANGUAGE sql STABLE
AS $$
  SELECT insumo_id, nome_padrao, MAX(sim) AS similaridade
  FROM (
    -- Match direto pelo nome padrão
    SELECT i.id    AS insumo_id,
           i.nome_padrao,
           similarity(upper(i.nome_padrao), upper(p_descricao)) AS sim
    FROM public.insumos i
    WHERE similarity(upper(i.nome_padrao), upper(p_descricao)) > 0.25

    UNION ALL

    -- Match pelos sinônimos
    SELECT i.id    AS insumo_id,
           i.nome_padrao,
           similarity(upper(s.sinonimo), upper(p_descricao)) AS sim
    FROM public.insumo_sinonimos s
    JOIN public.insumos i ON i.id = s.insumo_id
    WHERE similarity(upper(s.sinonimo), upper(p_descricao)) > 0.25
  ) sub
  GROUP BY insumo_id, nome_padrao
  ORDER BY similaridade DESC
  LIMIT p_limite;
$$;
