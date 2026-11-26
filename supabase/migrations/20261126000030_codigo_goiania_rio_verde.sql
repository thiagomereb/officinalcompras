-- As duas unidades da farmácia, Goiânia (Marista) e Rio Verde (Barrinha), têm
-- cada uma o seu código de produto: na maioria dos produtos é o mesmo, mas há
-- números que são um produto numa e outro na outra. O insumo passa a ter um
-- campo de código para cada unidade, e cada login vê o da sua unidade.

-- A unidade pelo texto do relatório da cotação ("FARMACIA OFFICINAL [MARISTA]",
-- "FARMACIA OFFICINAL (RV) - UNIDADE 1 (BARRINHA)"). O app usa a mesma regra
-- (lib/unidades-farmacia.ts).
CREATE OR REPLACE FUNCTION public.unidade_farmacia(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN upper(coalesce(p, '')) ~ '(MARISTA|GOI[AÂ]NIA)' THEN 'goiania'
    WHEN upper(coalesce(p, '')) ~ '(BARRINHA|\(RV\)|RIO VERDE)' THEN 'rio_verde'
  END
$$;

ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS codigo_goiania text,
  ADD COLUMN IF NOT EXISTS codigo_rio_verde text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insumos_codigo_goiania_key') THEN
    ALTER TABLE public.insumos ADD CONSTRAINT insumos_codigo_goiania_key UNIQUE (codigo_goiania);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insumos_codigo_rio_verde_key') THEN
    ALTER TABLE public.insumos ADD CONSTRAINT insumos_codigo_rio_verde_key UNIQUE (codigo_rio_verde);
  END IF;
END $$;

-- Os códigos por unidade que já existiam (um por insumo; havendo dois, o mais recente)
DO $$
BEGIN
  IF to_regclass('public.insumo_codigos') IS NOT NULL THEN
    UPDATE public.insumos i SET codigo_goiania = c.codigo
    FROM (
      SELECT DISTINCT ON (insumo_id) insumo_id, codigo FROM public.insumo_codigos
      WHERE public.unidade_farmacia(unidade) = 'goiania'
      ORDER BY insumo_id, created_at DESC
    ) c
    WHERE c.insumo_id = i.id;

    UPDATE public.insumos i SET codigo_rio_verde = c.codigo
    FROM (
      SELECT DISTINCT ON (insumo_id) insumo_id, codigo FROM public.insumo_codigos
      WHERE public.unidade_farmacia(unidade) = 'rio_verde'
      ORDER BY insumo_id, created_at DESC
    ) c
    WHERE c.insumo_id = i.id;

    DROP TABLE public.insumo_codigos;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.chave_unidade(text);

COMMENT ON COLUMN public.insumos.codigo IS
  'Obsoleto desde 25/11/2026: o código é por unidade (codigo_goiania, codigo_rio_verde). Não é mais lido nem gravado.';

-- Importação: o código só reconhece o insumo no campo da unidade da cotação;
-- sem ele, o nome padrão ou um sinônimo idêntico; sem eles, um insumo novo com o
-- nome do relatório. O insumo que ainda não tem código na unidade recebe o da linha.
CREATE OR REPLACE FUNCTION public.importar_cotacao_propria(p_cotacao jsonb, p_itens jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id      uuid;
  v_item    jsonb;
  v_ordem   bigint;
  v_insumo  uuid;
  v_codigo  text;
  v_unidade text := public.unidade_farmacia(p_cotacao ->> 'unidade');
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
    v_codigo := v_item ->> 'codigo';

    IF v_unidade = 'goiania' THEN
      SELECT id INTO v_insumo FROM public.insumos WHERE codigo_goiania = v_codigo;
    ELSIF v_unidade = 'rio_verde' THEN
      SELECT id INTO v_insumo FROM public.insumos WHERE codigo_rio_verde = v_codigo;
    END IF;

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

      IF v_unidade = 'goiania' THEN
        UPDATE public.insumos SET codigo_goiania = v_codigo
        WHERE id = v_insumo AND codigo_goiania IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.insumos WHERE codigo_goiania = v_codigo);
      ELSIF v_unidade = 'rio_verde' THEN
        UPDATE public.insumos SET codigo_rio_verde = v_codigo
        WHERE id = v_insumo AND codigo_rio_verde IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.insumos WHERE codigo_rio_verde = v_codigo);
      END IF;
    END IF;

    INSERT INTO public.cotacao_propria_itens
      (cotacao_propria_id, ordem, codigo, ean, nome, teor, quantidade, unidade, insumo_id)
    VALUES (
      v_id,
      v_ordem,
      v_codigo,
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

-- A unidade de cada login: decide qual campo de código ele vê. Login novo entra
-- sem unidade (vê os dois) até ela ser definida em Configurações.
CREATE TABLE IF NOT EXISTS public.usuarios_unidade (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  unidade    text CHECK (unidade IN ('goiania', 'rio_verde')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios_unidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON public.usuarios_unidade;
CREATE POLICY "Authenticated full access" ON public.usuarios_unidade
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.registrar_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios_unidade (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_usuario() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS registrar_usuario ON auth.users;
CREATE TRIGGER registrar_usuario
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.registrar_usuario();

INSERT INTO public.usuarios_unidade (user_id, email)
SELECT id, email FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
