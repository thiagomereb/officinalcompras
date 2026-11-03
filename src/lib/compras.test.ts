import { describe, expect, it } from 'vitest'
import { calcularScores, agruparPorInsumo, PESOS_PADRAO, type CandidatoSemScore } from './comparacao'
import { montarAprovacao, sugestaoDoGrupo, valorEstimado, type Escolha } from './compras'

function oferta(over: Partial<CandidatoSemScore> & Pick<CandidatoSemScore, 'cotacao_item_id'>): CandidatoSemScore {
  return {
    cotacao_id: `cot-${over.cotacao_item_id}`,
    insumo_id: 'acido',
    insumo_nome: 'Ácido Ascórbico',
    fornecedor_nome: over.cotacao_item_id,
    preco_unitario: 100,
    unidade: 'kg',
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

// Galena: 1 kg a R$85 (R$0,085/g). Fagron: 100 g a R$11,20 (R$0,112/g).
const grupos = agruparPorInsumo(
  calcularScores(
    [
      oferta({ cotacao_item_id: 'galena', preco_unitario: 85, quantidade_minima: 1, unidade: 'kg' }),
      oferta({ cotacao_item_id: 'fagron', preco_unitario: 11.2, quantidade_minima: 100, unidade: 'g' }),
    ],
    PESOS_PADRAO,
  ),
)

const escolha = (over: Partial<Escolha>): Escolha => ({
  insumo_id: 'acido',
  cotacao_item_id: 'galena',
  quantidade: 3,
  quantidade_unidade: 'kg',
  ...over,
})

describe('valorEstimado', () => {
  it('converte a quantidade para a base da oferta', () => {
    expect(valorEstimado({ preco_base: 0.085, unidade_base: 'g' }, 3, 'kg')).toEqual({ tipo: 'valor', valor: 255 })
    expect(valorEstimado({ preco_base: 0.03, unidade_base: 'mL' }, 2, 'L')).toEqual({ tipo: 'valor', valor: 60 })
  })

  it('recusa grandezas diferentes e oferta sem conversão', () => {
    expect(valorEstimado({ preco_base: 0.085, unidade_base: 'g' }, 3, 'L').tipo).toBe('grandeza_diferente')
    expect(valorEstimado({ preco_base: 2, unidade_base: 'un' }, 3, 'kg').tipo).toBe('sem_conversao')
    expect(valorEstimado({ preco_base: 0.085, unidade_base: 'g' }, null, 'kg').tipo).toBe('sem_quantidade')
  })
})

describe('sugestaoDoGrupo', () => {
  it('sugere o melhor score só quando há com quem comparar', () => {
    expect(sugestaoDoGrupo(grupos[0])?.cotacao_item_id).toBe('galena')
    expect(sugestaoDoGrupo({ ...grupos[0], candidatos: [grupos[0].candidatos[1]] })).toBeNull()
  })
})

describe('montarAprovacao', () => {
  it('congela a oferta escolhida, o valor e se seguiu a sugestão', () => {
    const r = montarAprovacao(grupos, [escolha({ cotacao_item_id: 'fagron' })], PESOS_PADRAO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.itens[0]).toMatchObject({
      fornecedor_nome: 'fagron',
      preco_unitario: 11.2,
      embalagem: 100,
      sugerido: false,
      valor_total: 336,
    })
    expect(r.valorTotal).toBe(336)
    expect(r.comparacao.grupos).toHaveLength(1)
  })

  it('aponta tudo que impede a aprovação de uma vez', () => {
    const r = montarAprovacao(
      [...grupos, { ...grupos[0], insumo_id: 'cafeina', insumo_nome: 'Cafeína' }],
      [escolha({ quantidade: null }), escolha({ insumo_id: 'cafeina', quantidade_unidade: 'mL' })],
      PESOS_PADRAO,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erros).toHaveLength(2)
    expect(r.erros[0]).toContain('Ácido Ascórbico')
    expect(r.erros[1]).toContain('vendida por g')
  })

  it('exige ao menos uma escolha', () => {
    expect(montarAprovacao(grupos, [], PESOS_PADRAO).ok).toBe(false)
  })
})
