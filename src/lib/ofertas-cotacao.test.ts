import { describe, expect, it } from 'vitest'
import { melhorDoFornecedor, resumirProduto, type OfertaProduto } from './ofertas-cotacao'

const oferta = (over: Partial<OfertaProduto>): OfertaProduto => ({
  itemId: 'i',
  pedidoId: 'p',
  orcamentoId: 'o',
  fornecedorId: 'f',
  fornecedor: 'F',
  precoEmbalagem: 100,
  embalagem: 1,
  unidade: 'kg',
  embalagens: 1,
  validade: null,
  aConferir: false,
  ...over,
})

// Pedido de 500 g
const pedido = { quantidade: 500, unidade: 'g' }

describe('resumirProduto', () => {
  it('conta fornecedores (QF) e acha o menor preço por g entre os comparáveis', () => {
    const r = resumirProduto(pedido, [
      oferta({ itemId: 'a1', fornecedorId: 'a', precoEmbalagem: 95, embalagem: 1, unidade: 'kg' }), // 0,095/g
      oferta({ itemId: 'a2', fornecedorId: 'a', precoEmbalagem: 400, embalagem: 5, unidade: 'kg' }), // 0,08/g
      oferta({ itemId: 'b1', fornecedorId: 'b', precoEmbalagem: 11.2, embalagem: 100, unidade: 'g' }), // 0,112/g
      oferta({ itemId: 'c1', fornecedorId: 'c', precoEmbalagem: 1, embalagem: 1, unidade: 'un' }), // não compara
    ])
    expect(r.qf).toBe(3)
    expect(r.menor?.itemId).toBe('a2')
    expect([...r.fornecedoresMenor]).toEqual(['a'])
    // 500 g × R$ 0,08/g
    expect(r.menor?.valorPedido).toBe(40)
    expect(r.ofertas.find((o) => o.itemId === 'c1')?.valorPedido).toBeNull()
  })

  it('sem ofertas: QF 0 e sem menor preço', () => {
    const r = resumirProduto(pedido, [])
    expect(r.qf).toBe(0)
    expect(r.menor).toBeNull()
  })
})

describe('melhorDoFornecedor', () => {
  it('pega a embalagem mais barata por g do fornecedor', () => {
    const r = resumirProduto(pedido, [
      oferta({ itemId: 'a1', fornecedorId: 'a', precoEmbalagem: 95 }),
      oferta({ itemId: 'a2', fornecedorId: 'a', precoEmbalagem: 400, embalagem: 5 }),
    ])
    expect(melhorDoFornecedor(r, 'a')?.itemId).toBe('a2')
    expect(melhorDoFornecedor(r, 'x')).toBeNull()
  })
})
