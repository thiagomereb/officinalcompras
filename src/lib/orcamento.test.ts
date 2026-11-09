import { describe, expect, it } from 'vitest'
import { conferirTotal, itemParaGravar, unirPaginas } from './orcamento'
import { precoPorUnidadeBase } from './unidades'

const item = (over: Record<string, unknown>) => ({
  descricao: 'Item',
  embalagem_quantidade: 1,
  embalagem_unidade: 'kg',
  quantidade_embalagens: 1,
  valor_total: 100,
  codigo_pedido: null,
  ...over,
})

describe('unirPaginas', () => {
  it('junta itens e pega o cabeçalho da página que tiver cada campo', () => {
    const r = unirPaginas([
      { numero: 'AABC66', cnpj: '11.222.333/0001-81', data: '2026-05-22', frete: 'cif', itens: [item({ descricao: 'A' })] },
      { numero: null, pedido_minimo: 900, total_documento: 8364.02, itens: [item({ descricao: 'B' }), { descricao: 'sem preço' }] },
    ])
    expect(r.cabecalho).toMatchObject({ numero: 'AABC66', frete: 'CIF', pedido_minimo: 900, total_documento: 8364.02 })
    // Item sem total/embalagem é descartado
    expect(r.itens.map((i) => i.descricao)).toEqual(['A', 'B'])
  })
})

describe('itemParaGravar', () => {
  it('calcula o preço de uma embalagem a partir do total', () => {
    // CACTIX: 4 embalagens de 250 g por R$ 630,32
    const g = itemParaGravar(unirPaginas([{ itens: [item({ embalagem_quantidade: 250, embalagem_unidade: 'g', quantidade_embalagens: 4, valor_total: 630.32 })] }]).itens[0])
    expect(g).toEqual({ preco_unitario: 157.58, quantidade_minima: 250, quantidade: 4, unidade: 'g' })
    expect(precoPorUnidadeBase(g.preco_unitario, g.quantidade_minima, g.unidade).valor).toBeCloseTo(0.63, 2)
  })

  it('entende cápsulas por milheiro', () => {
    const g = itemParaGravar(unirPaginas([{ itens: [item({ embalagem_quantidade: 5, embalagem_unidade: 'MIL', valor_total: 385.05 })] }]).itens[0])
    expect(precoPorUnidadeBase(g.preco_unitario, g.quantidade_minima, g.unidade)).toEqual({ valor: expect.closeTo(0.077, 4), base: 'un' })
  })
})

describe('conferirTotal', () => {
  it('bate com o total sem ou com impostos', () => {
    const itens = unirPaginas([{ itens: [item({ valor_total: 100, ipi: 10 }), item({ valor_total: 50 })] }]).itens
    expect(conferirTotal(itens, 150).bate).toBe(true)
    expect(conferirTotal(itens, 160).bate).toBe(true)
    expect(conferirTotal(itens, 200).bate).toBe(false)
    expect(conferirTotal(itens, null).bate).toBeNull()
  })
})
