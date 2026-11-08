-- Cotação própria: o pedido de cotação que sai do sistema da farmácia (relatório
-- "[90] Produtos para cotação"). Passa a ser a âncora do fluxo: os orçamentos
-- dos fornecedores entram dentro dela e o mapa compara as ofertas produto a
-- produto.

-- Código do produto no sistema da farmácia. Identifica o insumo de uma cotação
-- para outra sem depender do nome; é preenchido na importação.
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS codigo text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insumos_codigo_key') THEN
    ALTER TABLE public.insumos ADD CONSTRAINT insumos_codigo_key UNIQUE (codigo);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cotacoes_proprias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- "COTAÇÃO: 261100007"
  numero       text NOT NULL UNIQUE,
  -- "FAVOR ENVIAR A SEGUINTE COTAÇÃO PARA: FARMACIA OFFICINAL [MARISTA]"
  unidade      text,
  -- Data e hora de emissão do relatório
  emitida_em   timestamptz,
  arquivo_url  text,
  arquivo_nome text,
  status       text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida')),
  importada_por text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotacao_propria_itens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_propria_id uuid NOT NULL REFERENCES public.cotacoes_proprias(id) ON DELETE CASCADE,
  -- Posição no relatório
  ordem              integer NOT NULL,
  codigo             text NOT NULL,
  -- null quando o relatório traz "SEM GTIN"
  ean                text,
  nome               text NOT NULL,
  -- O "[95.0000 %]" depois do nome
  teor               numeric(9, 4),
  quantidade         numeric NOT NULL CHECK (quantidade >= 0),
  unidade            text NOT NULL,
  insumo_id          uuid NOT NULL REFERENCES public.insumos(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cotacao_propria_id, codigo)
);

CREATE INDEX IF NOT EXISTS cotacao_propria_itens_insumo_idx ON public.cotacao_propria_itens (insumo_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.cotacoes_proprias;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cotacoes_proprias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cotacoes_proprias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_propria_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON public.cotacoes_proprias;
CREATE POLICY "Authenticated full access" ON public.cotacoes_proprias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access" ON public.cotacao_propria_itens;
CREATE POLICY "Authenticated full access" ON public.cotacao_propria_itens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grava a cotação e os itens numa transação só. Cada item é ligado a um insumo
-- do cadastro: primeiro pelo código; depois pelo nome padrão ou por um
-- sinônimo idêntico (sem diferenciar maiúsculas), gravando o código no insumo;
-- se não houver, o produto entra no cadastro com o nome do sistema da farmácia.
-- A leitura do PDF e a validação dos campos ficam no app (lib/cotacao-propria.ts
-- e cotacoes-proprias/actions.ts).
CREATE OR REPLACE FUNCTION public.importar_cotacao_propria(p_cotacao jsonb, p_itens jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id     uuid;
  v_item   jsonb;
  v_ordem  bigint;
  v_insumo uuid;
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

    SELECT id INTO v_insumo FROM public.insumos WHERE codigo = v_item ->> 'codigo';

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
        INSERT INTO public.insumos (nome_padrao, unidade_padrao, codigo)
        VALUES (v_item ->> 'nome', v_item ->> 'unidade', v_item ->> 'codigo')
        RETURNING id INTO v_insumo;
      ELSE
        UPDATE public.insumos SET codigo = v_item ->> 'codigo' WHERE id = v_insumo AND codigo IS NULL;
      END IF;
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

-- Funções novas nascem executáveis por PUBLIC (inclusive "anon"); o app só
-- chama esta com usuário logado.
REVOKE EXECUTE ON FUNCTION public.importar_cotacao_propria(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.importar_cotacao_propria(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.importar_cotacao_propria(jsonb, jsonb) TO authenticated;
