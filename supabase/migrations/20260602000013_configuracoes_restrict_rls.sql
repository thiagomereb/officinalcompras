-- A policy original da tabela "configuracoes" não tinha "TO authenticated",
-- então se aplicava a PUBLIC (incluindo o role "anon"), expondo segredos como
-- a chave de API da OpenAI a qualquer requisição não autenticada via PostgREST.
-- Agora que o app exige login (ver middleware.ts), restringe a authenticated.
DROP POLICY IF EXISTS "configuracoes_all" ON public.configuracoes;

CREATE POLICY "configuracoes_all" ON public.configuracoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
