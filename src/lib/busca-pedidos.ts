// Produto pedido na cotação própria, com os sinônimos do insumo dele para a busca
export type ProdutoPedidoOpcao = { id: string; codigo: string; nome: string; sinonimos: string[] }

export type ResultadoBusca = { produto: ProdutoPedidoOpcao; viaSinonimo: string | null }

const MAX_OPCOES = 8
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Busca por nome, código ou sinônimo ("vitamina c" acha "ACIDO ASCORBICO"):
// primeiro quem bate pelo nome ou código, depois quem bate só por um sinônimo
export function buscarProdutosPedidos(pedidos: ProdutoPedidoOpcao[], termo: string, max = MAX_OPCOES): ResultadoBusca[] {
  const t = normalizar(termo)
  if (!t) return pedidos.slice(0, max).map((produto) => ({ produto, viaSinonimo: null }))
  const porNome: ResultadoBusca[] = []
  const porSinonimo: ResultadoBusca[] = []
  for (const p of pedidos) {
    if (normalizar(p.nome).includes(t) || p.codigo.includes(t)) porNome.push({ produto: p, viaSinonimo: null })
    else {
      const s = p.sinonimos.find((x) => normalizar(x).includes(t))
      if (s) porSinonimo.push({ produto: p, viaSinonimo: s })
    }
  }
  return [...porNome, ...porSinonimo].slice(0, max)
}
