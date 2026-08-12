-- Tabela de configurações do sistema (chave-valor)
CREATE TABLE IF NOT EXISTS configuracoes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  chave       TEXT        UNIQUE NOT NULL,
  valor       TEXT,
  descricao   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Acesso total (app interno sem autenticação por enquanto)
CREATE POLICY "configuracoes_all" ON configuracoes FOR ALL USING (true) WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER configuracoes_updated_at
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
