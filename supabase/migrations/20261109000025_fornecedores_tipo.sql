-- Tipo e credenciamento do fornecedor, como no sistema da farmácia (relatório
-- "[238] Fornecedores c/ CNPJ por tipo de fornecedor"). O orçamento só oferece
-- e só reconhece fornecedores dos tipos de compra de insumos; padaria, IPTU e
-- transportadora ficam no cadastro mas fora dessa escolha.
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS credenciado boolean;

CREATE INDEX IF NOT EXISTS fornecedores_tipo_idx ON public.fornecedores (tipo);
