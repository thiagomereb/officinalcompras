import { precoPorUnidadeBase, quantidadeEmBase } from './unidades'

// Ofertas dos orçamentos ligadas a um produto pedido da cotação própria. O
// preço é comparado por unidade base (R$/g, R$/mL) e só entre ofertas na mesma
// grandeza do pedido: R$/un não se compara com um pedido em gramas.

export type OfertaProduto = {
  itemId: string
  pedidoId: string
  orcamentoId: string
  fornecedorId: string
  fornecedor: string
  precoEmbalagem: number
  embalagem: number | null
  unidade: string | null
  embalagens: number | null
  validade: string | null
  aConferir: boolean
}

export type PedidoBase = { quantidade: number; unidade: string }

export type OfertaAvaliada = OfertaProduto & {
  precoBase: number
  base: string | null
  comparavel: boolean
  // Quantidade pedida × preço por unidade base; null quando não dá para comparar
  valorPedido: number | null
}

export function avaliarOferta(pedido: PedidoBase, oferta: OfertaProduto): OfertaAvaliada {
  const preco = precoPorUnidadeBase(oferta.precoEmbalagem, oferta.embalagem, oferta.unidade)
  const qtd = quantidadeEmBase(pedido.quantidade, pedido.unidade)
  const comparavel = preco.base != null && preco.base === qtd.base
  return {
    ...oferta,
    precoBase: preco.valor,
    base: preco.base,
    comparavel,
    valorPedido: comparavel ? Math.round(qtd.valor * preco.valor * 100) / 100 : null,
  }
}

export type ResumoProduto = {
  // QF: quantos fornecedores cotaram o produto
  qf: number
  ofertas: OfertaAvaliada[]
  // Menor preço por unidade base entre as ofertas comparáveis (ME)
  menor: OfertaAvaliada | null
  // Fornecedores empatados no menor preço
  fornecedoresMenor: Set<string>
}

const EMPATE = 1e-9

export function resumirProduto(pedido: PedidoBase, ofertas: OfertaProduto[]): ResumoProduto {
  const avaliadas = ofertas.map((o) => avaliarOferta(pedido, o))
  const comparaveis = avaliadas.filter((o) => o.comparavel)
  const menor = comparaveis.reduce<OfertaAvaliada | null>((m, o) => (!m || o.precoBase < m.precoBase ? o : m), null)
  return {
    qf: new Set(avaliadas.map((o) => o.fornecedorId)).size,
    ofertas: avaliadas,
    menor,
    fornecedoresMenor: new Set(
      menor ? comparaveis.filter((o) => o.precoBase - menor.precoBase <= EMPATE).map((o) => o.fornecedorId) : [],
    ),
  }
}

// A melhor oferta de um fornecedor para o produto (ele pode mandar mais de uma
// embalagem): a de menor preço comparável, ou a primeira se nenhuma comparar
export function melhorDoFornecedor(resumo: ResumoProduto, fornecedorId: string): OfertaAvaliada | null {
  const dele = resumo.ofertas.filter((o) => o.fornecedorId === fornecedorId)
  if (!dele.length) return null
  const comparaveis = dele.filter((o) => o.comparavel)
  return comparaveis.length ? comparaveis.reduce((m, o) => (o.precoBase < m.precoBase ? o : m)) : dele[0]
}
