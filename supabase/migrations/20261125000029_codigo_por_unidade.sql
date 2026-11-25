-- O código do produto é de cada unidade da farmácia: na maioria dos produtos é
-- o mesmo nas duas, mas há códigos que são um produto numa e outro na outra
-- (1000095 = L-ARGININA HCL na Marista e ALLOPURINOL na Barrinha). Com o código
-- único em insumos.codigo, a importação ligava o produto de uma unidade ao
-- insumo da outra. Agora o código vale dentro da unidade da cotação.

-- Unidade como chave: o texto do relatório ("FARMACIA OFFICINAL [MARISTA]"),
-- sem diferença de maiúsculas e espaços. O app usa a mesma regra
-- (lib/unidades-farmacia.ts).
CREATE OR REPLACE FUNCTION public.chave_unidade(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT upper(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')) $$;

CREATE TABLE IF NOT EXISTS public.insumo_codigos (
  unidade    text NOT NULL,
  codigo     text NOT NULL,
  insumo_id  uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, codigo)
);

CREATE INDEX IF NOT EXISTS insumo_codigos_insumo_idx ON public.insumo_codigos (insumo_id);

ALTER TABLE public.insumo_codigos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON public.insumo_codigos;
CREATE POLICY "Authenticated full access" ON public.insumo_codigos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- O que as cotações atuais já dizem: cada linha que veio do PDF (mesmo
-- created_at da cotação), na unidade da cotação dela. As incluídas à mão antes
-- desta mudança ficam de fora: o formulário preenchia o código antigo do
-- insumo, que podia ser o da outra unidade.
INSERT INTO public.insumo_codigos (unidade, codigo, insumo_id)
SELECT DISTINCT ON (public.chave_unidade(cp.unidade), p.codigo)
       public.chave_unidade(cp.unidade), p.codigo, p.insumo_id
FROM public.cotacao_propria_itens p
JOIN public.cotacoes_proprias cp ON cp.id = p.cotacao_propria_id
WHERE p.created_at = cp.created_at
ORDER BY public.chave_unidade(cp.unidade), p.codigo, p.ordem
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.insumos.codigo IS
  'Obsoleto desde 25/11/2026: o código é por unidade, em insumo_codigos. Não é mais lido nem gravado.';

-- Importação: o código só reconhece o insumo dentro da unidade da cotação;
-- sem ele, o nome padrão ou um sinônimo idêntico; sem eles, um insumo novo com o
-- nome do relatório. O código encontrado fica guardado para a unidade.
CREATE OR REPLACE FUNCTION public.importar_cotacao_propria(p_cotacao jsonb, p_itens jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id      uuid;
  v_item    jsonb;
  v_ordem   bigint;
  v_insumo  uuid;
  v_unidade text := public.chave_unidade(p_cotacao ->> 'unidade');
BEGIN
  IF EXISTS (SELECT 1 FROM public.cotacoes_proprias WHERE numero = p_cotacao ->> 'numero') THEN
    RAISE EXCEPTION 'A cotação % já foi importada.', p_cotacao ->> 'numero' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.cotacoes_proprias (numero, unidade, emitida_em, arquivo_url, arquivo_nome, importada_por)
  VALUES (
    p_cotacao ->> 'numero',
    nullif(p_cotacao ->> 'unidade', ''),
    (p_cotacao ->> 'emitida_em')::timestamptz,
    p_cotacao ->> 'arquivo_url',
    p_cotacao ->> 'arquivo_nome',
    coalesce(auth.jwt() ->> 'email', 'não identificado')
  )
  RETURNING id INTO v_id;

  FOR v_item, v_ordem IN SELECT value, ordinality FROM jsonb_array_elements(p_itens) WITH ORDINALITY LOOP
    v_insumo := NULL;

    SELECT insumo_id INTO v_insumo FROM public.insumo_codigos
    WHERE unidade = v_unidade AND codigo = v_item ->> 'codigo';

    IF v_insumo IS NULL THEN
      SELECT id INTO v_insumo FROM public.insumos
      WHERE upper(trim(nome_padrao)) = upper(trim(v_item ->> 'nome'))
      LIMIT 1;

      IF v_insumo IS NULL THEN
        SELECT insumo_id INTO v_insumo FROM public.insumo_sinonimos
        WHERE upper(trim(sinonimo)) = upper(trim(v_item ->> 'nome'))
        LIMIT 1;
      END IF;

      IF v_insumo IS NULL THEN
        INSERT INTO public.insumos (nome_padrao, unidade_padrao)
        VALUES (v_item ->> 'nome', v_item ->> 'unidade')
        RETURNING id INTO v_insumo;
      END IF;

      INSERT INTO public.insumo_codigos (unidade, codigo, insumo_id)
      VALUES (v_unidade, v_item ->> 'codigo', v_insumo)
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.cotacao_propria_itens
      (cotacao_propria_id, ordem, codigo, ean, nome, teor, quantidade, unidade, insumo_id)
    VALUES (
      v_id,
      v_ordem,
      v_item ->> 'codigo',
      nullif(v_item ->> 'ean', ''),
      v_item ->> 'nome',
      (v_item ->> 'teor')::numeric,
      (v_item ->> 'quantidade')::numeric,
      v_item ->> 'unidade',
      v_insumo
    );
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.importar_cotacao_propria(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.importar_cotacao_propria(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.importar_cotacao_propria(jsonb, jsonb) TO authenticated;
