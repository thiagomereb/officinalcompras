-- Ordem de compra (pedido por fornecedor) a partir do mapa.

-- 1. Cápsulas e outros itens contados: o mapa passa a aceitar a quantidade de
-- compra em "un" (o preço deles já é por unidade, ex.: milheiro → R$/un).
ALTER TABLE public.mapa_cotacao_itens
  DROP CONSTRAINT IF EXISTS mapa_cotacao_itens_quantidade_unidade_check;
ALTER TABLE public.mapa_cotacao_itens
  ADD CONSTRAINT mapa_cotacao_itens_quantidade_unidade_check
  CHECK (quantidade_unidade IN ('mg', 'g', 'kg', 'mL', 'L', 'kL', 'un'));

-- 2. A farmácia que emite os documentos: o rodapé da ordem de compra (nome,
-- CNPJ, endereço, telefones, e-mail). Uma linha só. Os valores não ficam no
-- repositório, que é público: são gravados direto no banco.
CREATE TABLE IF NOT EXISTS public.empresa (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome text NOT NULL,
  cnpj text,
  endereco text,
  telefone text,
  email text,
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.empresa;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.empresa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON public.empresa;
CREATE POLICY "Authenticated full access" ON public.empresa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
