DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'insumos_nome_padrao_key'
      AND conrelid = 'public.insumos'::regclass
  ) THEN
    ALTER TABLE public.insumos ADD CONSTRAINT insumos_nome_padrao_key UNIQUE (nome_padrao);
  END IF;
END$$;
