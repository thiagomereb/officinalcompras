-- Habilita busca por similaridade de texto
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabela de referência de sinônimos (importada do Excel GYN)
CREATE TABLE IF NOT EXISTS sinonimos_ref (
  id              SERIAL PRIMARY KEY,
  produto_padrao  TEXT NOT NULL,   -- nome canônico (Produto principal)
  termo           TEXT NOT NULL,   -- termo de busca (pode ser o próprio nome ou um sinônimo)
  UNIQUE (produto_padrao, termo)
);

-- Índice trigram para busca rápida por similaridade
CREATE INDEX IF NOT EXISTS sinonimos_ref_termo_trgm  ON sinonimos_ref USING gin (termo  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sinonimos_ref_padrao_trgm ON sinonimos_ref USING gin (produto_padrao gin_trgm_ops);

-- RLS aberta (app interno)
ALTER TABLE sinonimos_ref ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sinonimos_ref_all" ON sinonimos_ref FOR ALL USING (true) WITH CHECK (true);

-- Função: dado um texto livre, retorna o produto_padrao mais próximo
CREATE OR REPLACE FUNCTION buscar_por_sinonimo(descricao TEXT, limite INT DEFAULT 3)
RETURNS TABLE (produto_padrao TEXT, termo_encontrado TEXT, similaridade FLOAT4)
LANGUAGE sql STABLE AS $$
  SELECT produto_padrao, termo, similarity(termo, descricao)
  FROM   sinonimos_ref
  WHERE  similarity(termo, descricao) > 0.25
  ORDER  BY similarity(termo, descricao) DESC
  LIMIT  limite;
$$;
