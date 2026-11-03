-- Histórico de compras.
--
-- Até aqui o mapa só apontava para as cotações e recalculava tudo ao abrir:
-- editar o prazo de uma cotação ou revincular um item mudava, depois da
-- assinatura, o que um mapa aprovado mostrava. Agora a aprovação congela a
-- decisão: cada escolha guarda uma cópia da oferta (fornecedor, preço,
-- embalagem, condições, quantidade e valor) e o mapa guarda a comparação
-- inteira como estava, quem aprovou e quando. Mapa aprovado não muda mais; só
-- pode ser cancelado, com motivo.

-- 1. Mapa: aprovação, valor, comparação congelada e cancelamento
ALTER TABLE public.mapas_cotacao
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_por text,
  ADD COLUMN IF NOT EXISTS valor_total numeric(14,2),
  ADD COLUMN IF NOT EXISTS comparacao jsonb,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por text,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

ALTER TABLE public.mapas_cotacao DROP CONSTRAINT IF EXISTS mapas_cotacao_status_check;
ALTER TABLE public.mapas_cotacao
  ADD CONSTRAINT mapas_cotacao_status_check
  CHECK (status IN ('rascunho', 'aprovado', 'exportado', 'cancelado'));

-- 2. Escolhas: unidade da quantidade e a cópia da oferta escolhida. A
-- quantidade passa a aceitar vazio — no rascunho ela ainda pode não ter sido
-- definida (antes o app gravava 1 por falta de opção).
ALTER TABLE public.mapa_cotacao_itens
  ALTER COLUMN quantidade DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS quantidade_unidade text
    CHECK (quantidade_unidade IN ('mg', 'g', 'kg', 'mL', 'L', 'kL')),
  ADD COLUMN IF NOT EXISTS insumo_nome text,
  ADD COLUMN IF NOT EXISTS fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS cotacao_id uuid,
  ADD COLUMN IF NOT EXISTS preco_unitario numeric(12,4),
  ADD COLUMN IF NOT EXISTS embalagem numeric(12,4),
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS preco_base numeric(18,8),
  ADD COLUMN IF NOT EXISTS unidade_base text,
  ADD COLUMN IF NOT EXISTS prazo_entrega_dias int,
  ADD COLUMN IF NOT EXISTS prazo_pagamento_dias int,
  ADD COLUMN IF NOT EXISTS frete_fixo numeric(12,2),
  ADD COLUMN IF NOT EXISTS validade date,
  ADD COLUMN IF NOT EXISTS score numeric(6,4),
  -- Se a escolha coincidiu com a sugestão do sistema (melhor score)
  ADD COLUMN IF NOT EXISTS sugerido boolean,
  ADD COLUMN IF NOT EXISTS valor_total numeric(14,2);

CREATE INDEX IF NOT EXISTS idx_mapa_cotacao_itens_insumo ON public.mapa_cotacao_itens (insumo_id);
CREATE INDEX IF NOT EXISTS idx_mapas_cotacao_aprovado_em ON public.mapas_cotacao (aprovado_em);

-- 3. Mapas aprovados antes desta migration: a cópia vem dos dados de hoje, que
-- é o que dá para recuperar. Sem a comparação congelada (comparacao fica
-- nula), a tela desses mapas avisa que os números são os atuais. Precisa rodar
-- antes das travas abaixo.
UPDATE public.mapa_cotacao_itens mi
SET insumo_nome = ins.nome_padrao,
    fornecedor_nome = coalesce(f.nome_fantasia, f.razao_social),
    cotacao_id = c.id,
    preco_unitario = ci.preco_unitario,
    embalagem = ci.quantidade_minima,
    unidade = ci.unidade,
    preco_base = ci.preco_unitario / (
      coalesce(nullif(ci.quantidade_minima, 0), 1) *
      CASE lower(coalesce(ci.unidade, ''))
        WHEN 'mcg' THEN 0.000001
        WHEN 'mg' THEN 0.001
        WHEN 'kg' THEN 1000
        WHEN 'l' THEN 1000
        ELSE 1
      END
    ),
    unidade_base = CASE
      WHEN lower(coalesce(ci.unidade, '')) IN ('mcg', 'mg', 'g', 'kg') THEN 'g'
      WHEN lower(coalesce(ci.unidade, '')) IN ('ml', 'l') THEN 'mL'
      ELSE ci.unidade
    END,
    prazo_entrega_dias = c.prazo_entrega_dias,
    prazo_pagamento_dias = c.prazo_pagamento_dias,
    frete_fixo = c.frete_fixo,
    validade = ci.validade
FROM public.mapas_cotacao m,
     public.cotacao_itens ci,
     public.cotacoes c,
     public.fornecedores f,
     public.insumos ins
WHERE mi.mapa_id = m.id
  AND m.status IN ('aprovado', 'exportado')
  AND ci.id = mi.cotacao_item_id
  AND c.id = ci.cotacao_id
  AND f.id = c.fornecedor_id
  AND ins.id = mi.insumo_id;

UPDATE public.mapas_cotacao
SET aprovado_em = updated_at
WHERE status IN ('aprovado', 'exportado') AND aprovado_em IS NULL;

-- 4. Travas: mapa aprovado não muda nem some. A única saída é cancelar (com
-- motivo), e o cancelado fica congelado também.
CREATE OR REPLACE FUNCTION public.proteger_mapa_aprovado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Mapa aprovado não pode ser excluído. Cancele o mapa para tirá-lo do histórico de compras.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'rascunho' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION 'Mapa cancelado não pode ser alterado.';
  END IF;

  IF NEW.status NOT IN ('aprovado', 'exportado', 'cancelado')
     OR NEW.titulo IS DISTINCT FROM OLD.titulo
     OR NEW.cotacoes_ids IS DISTINCT FROM OLD.cotacoes_ids
     OR NEW.pesos IS DISTINCT FROM OLD.pesos
     OR NEW.comparacao IS DISTINCT FROM OLD.comparacao
     OR NEW.valor_total IS DISTINCT FROM OLD.valor_total
     OR NEW.aprovado_em IS DISTINCT FROM OLD.aprovado_em
     OR NEW.aprovado_por IS DISTINCT FROM OLD.aprovado_por THEN
    RAISE EXCEPTION 'Mapa aprovado não pode ser alterado, só cancelado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_mapa_aprovado ON public.mapas_cotacao;
CREATE TRIGGER proteger_mapa_aprovado
  BEFORE UPDATE OR DELETE ON public.mapas_cotacao
  FOR EACH ROW EXECUTE FUNCTION public.proteger_mapa_aprovado();

CREATE OR REPLACE FUNCTION public.proteger_itens_mapa_aprovado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_mapa uuid;
  v_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_mapa := NEW.mapa_id;
  ELSE
    v_mapa := OLD.mapa_id;
  END IF;

  -- Sem linha (mapa em exclusão em cascata) vale como rascunho: só rascunho
  -- pode ser excluído, a trava do mapa garante isso
  SELECT status INTO v_status FROM public.mapas_cotacao WHERE id = v_mapa;
  IF v_status IS NOT NULL AND v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'As escolhas de um mapa aprovado não podem ser alteradas.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_itens_mapa_aprovado ON public.mapa_cotacao_itens;
CREATE TRIGGER proteger_itens_mapa_aprovado
  BEFORE INSERT OR UPDATE OR DELETE ON public.mapa_cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION public.proteger_itens_mapa_aprovado();

-- 5. Aprovação numa transação só: grava as escolhas com a cópia da oferta, a
-- comparação congelada, o valor e quem aprovou. Se qualquer parte falhar, o
-- mapa continua rascunho como estava. A cópia é montada no servidor do app
-- (lib/compras.ts), que tem a regra de score e de unidades.
CREATE OR REPLACE FUNCTION public.aprovar_mapa(
  p_mapa_id uuid,
  p_itens jsonb,
  p_comparacao jsonb,
  p_valor_total numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1 FROM public.mapas_cotacao WHERE id = p_mapa_id AND status = 'rascunho' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este mapa não está mais em rascunho.';
  END IF;

  DELETE FROM public.mapa_cotacao_itens WHERE mapa_id = p_mapa_id;

  INSERT INTO public.mapa_cotacao_itens (
    mapa_id, insumo_id, cotacao_item_id, quantidade, quantidade_unidade,
    insumo_nome, fornecedor_nome, cotacao_id, preco_unitario, embalagem, unidade,
    preco_base, unidade_base, prazo_entrega_dias, prazo_pagamento_dias, frete_fixo,
    validade, score, sugerido, valor_total
  )
  SELECT
    p_mapa_id, x.insumo_id, x.cotacao_item_id, x.quantidade, x.quantidade_unidade,
    x.insumo_nome, x.fornecedor_nome, x.cotacao_id, x.preco_unitario, x.embalagem, x.unidade,
    x.preco_base, x.unidade_base, x.prazo_entrega_dias, x.prazo_pagamento_dias, x.frete_fixo,
    x.validade, x.score, x.sugerido, x.valor_total
  FROM jsonb_to_recordset(p_itens) AS x(
    insumo_id uuid, cotacao_item_id uuid, quantidade numeric, quantidade_unidade text,
    insumo_nome text, fornecedor_nome text, cotacao_id uuid, preco_unitario numeric, embalagem numeric,
    unidade text, preco_base numeric, unidade_base text, prazo_entrega_dias int, prazo_pagamento_dias int,
    frete_fixo numeric, validade date, score numeric, sugerido boolean, valor_total numeric
  );

  UPDATE public.mapas_cotacao
  SET status = 'aprovado',
      aprovado_em = now(),
      aprovado_por = coalesce(auth.jwt() ->> 'email', 'não identificado'),
      comparacao = p_comparacao,
      valor_total = p_valor_total
  WHERE id = p_mapa_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aprovar_mapa(uuid, jsonb, jsonb, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aprovar_mapa(uuid, jsonb, jsonb, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprovar_mapa(uuid, jsonb, jsonb, numeric) TO authenticated;

-- 6. Histórico de compras: as escolhas de mapas aprovados, com a data e quem
-- aprovou. security_invoker faz o RLS das tabelas valer para quem consulta.
CREATE OR REPLACE VIEW public.historico_compras
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.mapa_id,
  m.titulo AS mapa_titulo,
  m.aprovado_em,
  m.aprovado_por,
  i.insumo_id,
  i.insumo_nome,
  i.fornecedor_nome,
  i.cotacao_id,
  i.cotacao_item_id,
  i.quantidade,
  i.quantidade_unidade,
  i.preco_unitario,
  i.embalagem,
  i.unidade,
  i.preco_base,
  i.unidade_base,
  i.valor_total,
  i.sugerido
FROM public.mapa_cotacao_itens i
JOIN public.mapas_cotacao m ON m.id = i.mapa_id
WHERE m.status IN ('aprovado', 'exportado');

REVOKE ALL ON public.historico_compras FROM anon;
GRANT SELECT ON public.historico_compras TO authenticated;
