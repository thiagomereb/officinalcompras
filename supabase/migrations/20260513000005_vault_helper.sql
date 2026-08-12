-- Função auxiliar para ler secrets do Supabase Vault sem expor o schema vault ao cliente
CREATE OR REPLACE FUNCTION get_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN secret_value;
END;
$$;
