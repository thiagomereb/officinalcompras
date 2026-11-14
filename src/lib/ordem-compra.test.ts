import { describe, expect, it } from 'vitest'
import { montarOrdens, rotuloProduto, type EscolhaParaOrdem, type ProdutoDaCotacao } from './ordem-compra'

const escolha = (over: Partial<EscolhaParaOrdem>): EscolhaParaOrdem => ({
  insumo_id: 'x',
  insumo_nome: 'X',
  fornecedor: 'Active Pharmaceutica',
  preco_base: 1,
  unidade_base: 'g',
  validade: null,
  quantidade: null,
  quantidade_unidade: null,
  valor_total: null,
  prazo_entrega_dias: null,
  prazo_pagamento_dias: null,
  ...over,
})

const pedidos: ProdutoDaCotacao[] = [
  { codigo: '1000765', nome: 'TIREOIDE DESSECADA', teor: 100, quantidade: 10, unidade: 'g', insumo_id: 'tireoide' },
  { codigo: '4000406', nome: 'CAPSULA VEGETAL Nº 1 400MG (INCOLOR)', teor: null, quantidade: 5000, unidade: 'un', insumo_id: 'capsula' },
  { codigo: '1002259', nome: 'PRASTERONA (C5)', teor: 100, quantidade: 100, unidade: 'g', insumo_id: 'prasterona' },
]

describe('rotuloProduto', () => {
  it('segue o pedido do ERP: código - nome [teor %]', () => {
    expect(rotuloProduto(pedidos[0])).toBe('1000765 - TIREOIDE DESSECADA [100.00 %]')
    expect(rotuloProduto(pedidos[1])).toBe('4000406 - CAPSULA VEGETAL Nº 1 400MG (INCOLOR)')
  })
})

describe('montarOrdens', () => {
  it('separa por fornecedor e segue a ordem dos produtos na cotação', () => {
    const ordens = montarOrdens(
      [
        escolha({ insumo_id: 'prasterona', fornecedor: 'Galena', preco_base: 33, quantidade: 100, quantidade_unidade: 'g' }),
        escolha({ insumo_id: 'capsula', fornecedor: 'Active Pharmaceutica', preco_base: 0.0503, unidade_base: 'un' }),
        escolha({ insumo_id: 'tireoide', fornecedor: 'Active Pharmaceutica', preco_base: 9.99, quantidade: 10, quantidade_unidade: 'g' }),
      ],
      pedidos,
    )
    expect(ordens.map((o) => [o.chave, o.fornecedor])).toEqual([
      ['active-pharmaceutica', 'Active Pharmaceutica'],
      ['galena', 'Galena'],
    ])
    expect(ordens[0].linhas.map((l) => l.produto)).toEqual([
      '1000765 - TIREOIDE DESSECADA [100.00 %]',
      '4000406 - CAPSULA VEGETAL Nº 1 400MG (INCOLOR)',
    ])
  })

  it('quantidade e unitário na unidade base; sem quantidade no mapa, usa a pedida', () => {
    const [ordem] = montarOrdens(
      [
        escolha({ insumo_id: 'tireoide', preco_base: 9.99, quantidade: 0.01, quantidade_unidade: 'kg' }),
        // Cápsula sem quantidade no mapa: 5.000 un pedidas na cotação
        escolha({ insumo_id: 'capsula', preco_base: 0.0503, unidade_base: 'un' }),
      ],
      pedidos,
    )
    expect(ordem.linhas[0]).toMatchObject({ quantidade: 10, unidade: 'g', precoUnitario: 9.99, total: 99.9 })
    expect(ordem.linhas[1]).toMatchObject({ quantidade: 5000, unidade: 'un', total: 251.5 })
    expect(ordem.total).toBe(351.4)
    expect(ordem.incompleto).toBe(false)
  })

  it('mapa aprovado usa o valor gravado na aprovação', () => {
    const [ordem] = montarOrdens(
      [escolha({ insumo_id: 'tireoide', preco_base: 9.99, quantidade: 10, quantidade_unidade: 'g', valor_total: 99.95 })],
      pedidos,
    )
    expect(ordem.linhas[0].total).toBe(99.95)
  })

  it('quantidade em outra grandeza que a oferta fica sem valor e marca a ordem', () => {
    const [ordem] = montarOrdens(
      [escolha({ insumo_id: 'capsula', preco_base: 0.0503, unidade_base: 'un', quantidade: 2, quantidade_unidade: 'kg' })],
      pedidos,
    )
    expect(ordem.linhas[0]).toMatchObject({ quantidade: 2000, unidade: 'g', total: null })
    expect(ordem.incompleto).toBe(true)
    expect(ordem.total).toBe(0)
  })

  it('leva os prazos do orçamento e diferencia fornecedores com o mesmo slug', () => {
    const ordens = montarOrdens(
      [
        escolha({ insumo_id: 'tireoide', fornecedor: 'Fagron', prazo_entrega_dias: 5, prazo_pagamento_dias: 28 }),
        escolha({ insumo_id: 'prasterona', fornecedor: 'FAGRON.' }),
      ],
      pedidos,
    )
    expect(ordens.map((o) => o.chave).sort()).toEqual(['fagron', 'fagron-2'])
    expect(ordens.find((o) => o.fornecedor === 'Fagron')).toMatchObject({ prazoEntregaDias: 5, prazoPagamentoDias: 28 })
  })
})
