-- Código do fornecedor no sistema da farmácia (relatório "[238] Fornecedores
-- c/ CNPJ"). Identifica o cadastro de uma importação para outra.
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS codigo text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedores_codigo_key') THEN
    ALTER TABLE public.fornecedores ADD CONSTRAINT fornecedores_codigo_key UNIQUE (codigo);
  END IF;
END $$;

-- O sistema da farmácia tem cadastros diferentes com o mesmo CNPJ (a mesma
-- empresa registrada duas vezes); a unicidade passa a ser do código.
ALTER TABLE public.fornecedores DROP CONSTRAINT IF EXISTS fornecedores_cnpj_key;
