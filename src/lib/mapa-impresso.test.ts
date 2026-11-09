import { describe, expect, it } from 'vitest'
import type { CandidatoItem, GrupoInsumo } from './comparacao'
import { montarMapaImpresso, type EscolhaImpressa, type PedidoMapa } from './mapa-impresso'

const candidato = (over: Partial<CandidatoItem>): CandidatoItem => ({
  cotacao_item_id: 'x',
  cotacao_id: 'o',
  insumo_id: 'acido',
  insumo_nome: 'ACIDO BORICO',
  fornecedor_nome: 'F',
  preco_unitario: 1,
  unidade: 'kg',
  quantidade_minima: 1,
  lote: null,
  validade: null,
  prazo_entrega_dias: null,
  prazo_pagamento_dias: null,
  frete_fixo: null,
  frete_gratis_acima: null,
  pedido_minimo: null,
  preco_base: 0.1,
  unidade_base: 'g',
  preco_comparavel: true,
  ...over,
})

const pedidos: PedidoMapa[] = [
  { codigo: '1006750', nome: 'SILICONE DC 2010', quantidade: 100, unidade: 'g', insumo_id: 'silicone' },
  { codigo: '1000021', nome: 'ACIDO BORICO', quantidade: 100, unidade: 'g', insumo_id: 'acido' },
]

const grupos: GrupoInsumo[] = [
  {
    insumo_id: 'acido',
    insumo_nome: 'ACIDO BORICO',
    candidatos: [
      candidato({ cotacao_item_id: 'f1', fornecedor_nome: 'Fagron', preco_base: 0.072 }),
      candidato({ cotacao_item_id: 'f2', fornecedor_nome: 'Fagron', preco_base: 0.09 }),
      candidato({ cotacao_item_id: 'g1', fornecedor_nome: 'Galena', preco_base: 0.08 }),
      candidato({ cotacao_item_id: 'g2', fornecedor_nome: 'Galena', preco_base: 0.05, unidade_base: 'un', preco_comparavel: false }),
    ],
  },
]

describe('montarMapaImpresso', () => {
  it('mantém a ordem da cotação, com todos os fornecedores em ordem alfabética', () => {
    const r = montarMapaImpresso({ pedidos, grupos, escolhas: new Map(), fornecedoresDosOrcamentos: ['Infinity', 'active'] })
    expect(r.fornecedores).toEqual(['active', 'Fagron', 'Galena', 'Infinity'])
    expect(r.linhas.map((l) => l.codigo)).toEqual(['1006750', '1000021'])
    // Produto sem oferta continua no mapa, sem preço de ninguém
    expect(r.linhas[0].precos).toEqual({})
  })

  it('mostra a oferta de menor preço comparável de cada fornecedor, sem marca sem escolha', () => {
    const { linhas } = montarMapaImpresso({ pedidos, grupos, escolhas: new Map(), fornecedoresDosOrcamentos: [] })
    expect(linhas[1].precos.Fagron).toEqual({ valor: 0.072, base: 'g', comparavel: true, escolhido: false })
    // A de 0,05/un é mais barata, mas é de outra grandeza
    expect(linhas[1].precos.Galena.valor).toBe(0.08)
  })

  it('marca a oferta escolhida, mesmo que não seja a mais barata do fornecedor', () => {
    const escolhas = new Map<string, EscolhaImpressa>([
      ['acido', { cotacao_item_id: 'f2', quantidade: 100, quantidade_unidade: 'g' }],
    ])
    const { linhas } = montarMapaImpresso({ pedidos, grupos, escolhas, fornecedoresDosOrcamentos: [] })
    expect(linhas[1].precos.Fagron).toMatchObject({ valor: 0.09, escolhido: true })
    expect(linhas[1].precos.Galena.escolhido).toBe(false)
    // Comprar o mesmo que foi pedido (em outra unidade ou não) não repete a quantidade
    expect(linhas[1].compra).toBeNull()
  })

  it('mostra a quantidade de compra quando ela difere do pedido', () => {
    const escolhas = new Map<string, EscolhaImpressa>([
      ['acido', { cotacao_item_id: 'g1', quantidade: 1, quantidade_unidade: 'kg' }],
    ])
    const { linhas } = montarMapaImpresso({ pedidos, grupos, escolhas, fornecedoresDosOrcamentos: [] })
    expect(linhas[1].compra).toEqual({ quantidade: 1, unidade: 'kg' })

    const iguais = new Map<string, EscolhaImpressa>([
      ['acido', { cotacao_item_id: 'g1', quantidade: 0.1, quantidade_unidade: 'kg' }],
    ])
    expect(montarMapaImpresso({ pedidos, grupos, escolhas: iguais, fornecedoresDosOrcamentos: [] }).linhas[1].compra).toBeNull()
  })

  it('põe no fim o produto ofertado que não está entre os pedidos', () => {
    const { linhas } = montarMapaImpresso({ pedidos: pedidos.slice(0, 1), grupos, escolhas: new Map(), fornecedoresDosOrcamentos: [] })
    expect(linhas.map((l) => [l.codigo, l.nome])).toEqual([
      ['1006750', 'SILICONE DC 2010'],
      [null, 'ACIDO BORICO'],
    ])
  })
})
