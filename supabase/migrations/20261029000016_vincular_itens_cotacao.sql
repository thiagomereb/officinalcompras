-- Vincula de uma vez todos os itens sem insumo de uma cotação ao insumo mais
-- parecido (nome padrão ou sinônimo). Substitui o loop do app, que fazia 2
-- requisições sequenciais por item e estourava os 60s das Netlify Functions
-- em cotações grandes.
--
-- SECURITY INVOKER (padrão): roda com as permissões de quem chama, então o RLS
-- de cotacao_itens continua valendo.
CREATE OR REPLACE FUNCTION public.vincular_itens_cotacao(
  p_cotacao_id uuid,
  p_limiar     float4 DEFAULT 0.45
)
RETURNS integer
LANGUAGE sql
AS $$
  WITH candidatos AS (
    SELECT ci.id AS item_id, m.insumo_id
    FROM public.cotacao_itens ci
    CROSS JOIN LATERAL public.buscar_insumo_por_descricao(ci.descricao_original, 1) m
    WHERE ci.cotacao_id = p_cotacao_id
      AND ci.insumo_id IS NULL
      AND m.similaridade >= p_limiar
  ), atualizados AS (
    UPDATE public.cotacao_itens ci
    SET insumo_id = c.insumo_id
    FROM candidatos c
    WHERE ci.id = c.item_id
    RETURNING 1
  )
  SELECT count(*)::integer FROM atualizados;
$$;

-- Funções novas nascem executáveis por PUBLIC (inclusive "anon"); o app só
-- chama esta com usuário logado.
REVOKE EXECUTE ON FUNCTION public.vincular_itens_cotacao(uuid, float4) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vincular_itens_cotacao(uuid, float4) FROM anon;
GRANT EXECUTE ON FUNCTION public.vincular_itens_cotacao(uuid, float4) TO authenticated;
