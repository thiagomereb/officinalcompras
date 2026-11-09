import { describe, expect, it } from 'vitest'
import { buscarProdutosPedidos, type ProdutoPedidoOpcao } from './busca-pedidos'

const pedidos: ProdutoPedidoOpcao[] = [
  { id: '1', codigo: '1001029', nome: 'VITAMINA C (REVESTIDA)', sinonimos: ['ACIDO ASCORBICO (REVESTIDO - USO INTERNO)'] },
  { id: '2', codigo: '1000187', nome: 'CITRATO DE CALCIO', sinonimos: ['CALCIO CITRATO'] },
  { id: '3', codigo: '1004689', nome: 'ACIDO TRANEXAMICO', sinonimos: [] },
]

describe('buscarProdutosPedidos', () => {
  it('acha por nome sem diferenciar acento e por código', () => {
    expect(buscarProdutosPedidos(pedidos, 'tranexâmico').map((r) => r.produto.id)).toEqual(['3'])
    expect(buscarProdutosPedidos(pedidos, '1000187').map((r) => r.produto.id)).toEqual(['2'])
  })

  it('acha pelo sinônimo e diz qual foi', () => {
    expect(buscarProdutosPedidos(pedidos, 'ácido ascórbico')).toEqual([
      { produto: pedidos[0], viaSinonimo: 'ACIDO ASCORBICO (REVESTIDO - USO INTERNO)' },
    ])
  })

  it('quem bate pelo nome vem antes de quem bate só pelo sinônimo', () => {
    expect(buscarProdutosPedidos(pedidos, 'calcio').map((r) => [r.produto.id, r.viaSinonimo])).toEqual([['2', null]])
    expect(buscarProdutosPedidos(pedidos, 'acido').map((r) => r.produto.id)).toEqual(['3', '1'])
  })
})
