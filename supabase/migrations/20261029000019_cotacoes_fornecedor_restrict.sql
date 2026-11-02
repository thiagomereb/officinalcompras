-- Com ON DELETE CASCADE, excluir um fornecedor apagava em silêncio todas as
-- cotações e itens dele — o histórico de preços inteiro. Passa a barrar a
-- exclusão enquanto houver cotações; o caminho é desativar o fornecedor
-- (fornecedores.ativo), que o app já trata.
ALTER TABLE public.cotacoes DROP CONSTRAINT IF EXISTS cotacoes_fornecedor_id_fkey;

ALTER TABLE public.cotacoes
  ADD CONSTRAINT cotacoes_fornecedor_id_fkey
  FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE RESTRICT;
