const TAMANHO_PAGINA = 1000

// O PostgREST corta qualquer resposta em 1000 linhas (db-max-rows) sem avisar,
// então listas que podem passar disso — insumos, itens de cotação — são lidas
// em páginas. A consulta precisa ter um .order() estável para a paginação não
// pular nem repetir linhas.
export async function buscarTodos<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const todos: T[] = []
  for (;;) {
    const de = todos.length
    const { data, error } = await pagina(de, de + TAMANHO_PAGINA - 1)
    if (error) throw new Error(error.message)
    // Para só na página vazia (e não na "incompleta"), caso o projeto tenha um
    // max-rows menor que TAMANHO_PAGINA configurado no painel.
    if (!data?.length) return todos
    todos.push(...data)
  }
}
