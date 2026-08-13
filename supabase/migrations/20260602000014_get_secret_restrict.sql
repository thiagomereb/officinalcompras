-- get_secret() é SECURITY DEFINER e lê vault.decrypted_secrets, mas nunca teve
-- seu EXECUTE revogado do PUBLIC (grant padrão do Postgres para funções novas).
-- Como o Supabase expõe funções do schema public via PostgREST RPC, qualquer
-- caller (inclusive "anon") podia chamar /rest/v1/rpc/get_secret e ler
-- qualquer segredo do Vault. A função não é usada pelo app nem pelas Edge
-- Functions hoje — revoga o acesso público e concede apenas a service_role.
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_secret(text) TO service_role;
