-- Reverte a exposição pública do bucket "cotacoes" (arquivos de tabelas de
-- preços de fornecedores). A migration anterior tornou o bucket público e
-- criou uma policy de SELECT sem cláusula de role, permitindo download por
-- qualquer requisição não autenticada que descobrisse a URL (ex.: através do
-- app sem login, hoje corrigido, ou de logs/terceiros). O app agora gera
-- signed URLs sob demanda (ver src/lib/supabase/storage.ts) para exibir e
-- para enviar o arquivo à Edge Function de OCR, então o acesso público deixa
-- de ser necessário.
UPDATE storage.buckets SET public = false WHERE id = 'cotacoes';

DROP POLICY IF EXISTS "Public read cotacoes" ON storage.objects;
