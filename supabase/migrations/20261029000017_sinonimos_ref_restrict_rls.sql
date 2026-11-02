-- Mesmo problema corrigido em configuracoes (migration 013): a policy de
-- sinonimos_ref não tinha "TO authenticated", então valia para PUBLIC e
-- qualquer requisição sem login podia ler, alterar ou apagar a tabela via
-- PostgREST. Restringe a usuários autenticados.
DROP POLICY IF EXISTS "sinonimos_ref_all" ON public.sinonimos_ref;

CREATE POLICY "sinonimos_ref_all" ON public.sinonimos_ref
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.buscar_por_sinonimo(text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.buscar_por_sinonimo(text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.buscar_por_sinonimo(text, int) TO authenticated;
