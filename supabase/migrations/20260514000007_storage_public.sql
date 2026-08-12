-- Torna o bucket de cotações público para que as URLs sejam acessíveis
-- pela Edge Function e pela API do OpenAI (arquivos são tabelas de preços, não dados sensíveis)
UPDATE storage.buckets SET public = true WHERE id = 'cotacoes';

-- Adiciona política de leitura pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Public read cotacoes' AND tablename = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY "Public read cotacoes" ON storage.objects FOR SELECT USING (bucket_id = ''cotacoes'')';
  END IF;
END $$;
