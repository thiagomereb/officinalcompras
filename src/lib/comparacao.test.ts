import { describe, expect, it } from 'vitest'
import { compararOfertas, agruparPorInsumo, type OfertaCotacao } from './comparacao'

function oferta(over: Partial<OfertaCotacao> & Pick<OfertaCotacao, 'cotacao_item_id' | 'insumo_id'>): OfertaCotacao {
  return {
    cotacao_id: 'c',
    insumo_nome: over.insumo_id,
    fornecedor_nome: over.cotacao_item_id,
    preco_unitario: 10,
    unidade: 'g',
    quantidade_minima: 1,
    lote: null,
    validade: null,
    prazo_entrega_dias: null,
    prazo_pagamento_dias: null,
    frete_fixo: null,
    frete_gratis_acima: null,
    pedido_minimo: null,
    ...over,
  }
}

describe('compararOfertas', () => {
  it('converte o preço para a unidade base', () => {
    // 1 kg a R$100 (R$0,10/g) e 100 g a R$15 (R$0,15/g)
    const [kg, g] = compararOfertas([
      oferta({ cotacao_item_id: 'kg', insumo_id: 'x', preco_unitario: 100, quantidade_minima: 1, unidade: 'kg' }),
      oferta({ cotacao_item_id: 'g', insumo_id: 'x', preco_unitario: 15, quantidade_minima: 100, unidade: 'g' }),
    ])
    expect(kg.preco_base).toBeCloseTo(0.1)
    expect(g.preco_base).toBeCloseTo(0.15)
    expect(kg.unidade_base).toBe('g')
  })

  it('marca como não comparável a oferta de outra grandeza', () => {
    const ofertas = compararOfertas([
      oferta({ cotacao_item_id: 'a', insumo_id: 'x', unidade: 'g' }),
      oferta({ cotacao_item_id: 'b', insumo_id: 'x', unidade: 'g' }),
      oferta({ cotacao_item_id: 'c', insumo_id: 'x', unidade: 'un' }),
    ])
    expect(ofertas.map((o) => o.preco_comparavel)).toEqual([true, true, false])
  })

  it('compara só dentro do mesmo insumo', () => {
    const ofertas = compararOfertas([
      oferta({ cotacao_item_id: 'a', insumo_id: 'x', unidade: 'g' }),
      oferta({ cotacao_item_id: 'b', insumo_id: 'y', unidade: 'un' }),
    ])
    expect(ofertas.every((o) => o.preco_comparavel)).toBe(true)
  })
})

describe('agruparPorInsumo', () => {
  it('ordena do menor preço por unidade base e deixa o não comparável por último', () => {
    const grupos = agruparPorInsumo(
      compararOfertas([
        oferta({ cotacao_item_id: 'caro', insumo_id: 'x', preco_unitario: 20 }),
        oferta({ cotacao_item_id: 'unidade', insumo_id: 'x', preco_unitario: 1, unidade: 'un' }),
        oferta({ cotacao_item_id: 'barato', insumo_id: 'x', preco_unitario: 100, quantidade_minima: 1, unidade: 'kg' }),
        oferta({ cotacao_item_id: 'medio', insumo_id: 'x', preco_unitario: 12 }),
      ]),
    )
    expect(grupos[0].candidatos.map((c) => c.cotacao_item_id)).toEqual(['barato', 'medio', 'caro', 'unidade'])
  })
})
