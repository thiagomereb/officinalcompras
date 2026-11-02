import { describe, expect, it } from 'vitest'
import { calcularScores, agruparPorInsumo, validarPesos, PESOS_PADRAO, type CandidatoSemScore } from './comparacao'

function candidato(over: Partial<CandidatoSemScore> & Pick<CandidatoSemScore, 'cotacao_item_id' | 'insumo_id'>): CandidatoSemScore {
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

describe('calcularScores', () => {
  it('normaliza o preço dentro de cada insumo, não entre insumos', () => {
    // Dois insumos com faixas de preço muito diferentes. Antes a escala era
    // global e a diferença de 20% em "barato" virava ruído perto de "caro".
    const scores = calcularScores(
      [
        candidato({ cotacao_item_id: 'barato-a', insumo_id: 'barato', preco_unitario: 10 }),
        candidato({ cotacao_item_id: 'barato-b', insumo_id: 'barato', preco_unitario: 12 }),
        candidato({ cotacao_item_id: 'caro-a', insumo_id: 'caro', preco_unitario: 5000 }),
        candidato({ cotacao_item_id: 'caro-b', insumo_id: 'caro', preco_unitario: 9000 }),
      ],
      { preco: 100, entrega: 0, pagamento: 0, frete: 0 },
    )
    const porId = Object.fromEntries(scores.map((s) => [s.cotacao_item_id, s.score]))
    expect(porId['barato-a']).toBe(1)
    expect(porId['barato-b']).toBe(0)
    expect(porId['caro-a']).toBe(1)
    expect(porId['caro-b']).toBe(0)
  })

  it('converte unidades antes de comparar preço', () => {
    // 1 kg a R$100 (R$0,10/g) é mais barato que 100 g a R$15 (R$0,15/g)
    const [kg, g] = calcularScores(
      [
        candidato({ cotacao_item_id: 'kg', insumo_id: 'x', preco_unitario: 100, quantidade_minima: 1, unidade: 'kg' }),
        candidato({ cotacao_item_id: 'g', insumo_id: 'x', preco_unitario: 15, quantidade_minima: 100, unidade: 'g' }),
      ],
      { preco: 100, entrega: 0, pagamento: 0, frete: 0 },
    )
    expect(kg.preco_base).toBeCloseTo(0.1)
    expect(g.preco_base).toBeCloseTo(0.15)
    expect(kg.score).toBeGreaterThan(g.score)
  })

  it('prazo vazio fica neutro e não distorce a escala dos demais', () => {
    const scores = calcularScores(
      [
        candidato({ cotacao_item_id: 'rapido', insumo_id: 'x', prazo_entrega_dias: 5 }),
        candidato({ cotacao_item_id: 'lento', insumo_id: 'x', prazo_entrega_dias: 10 }),
        candidato({ cotacao_item_id: 'sem-prazo', insumo_id: 'x', prazo_entrega_dias: null }),
      ],
      { preco: 0, entrega: 100, pagamento: 0, frete: 0 },
    )
    const porId = Object.fromEntries(scores.map((s) => [s.cotacao_item_id, s.score]))
    expect(porId['rapido']).toBe(1)
    expect(porId['lento']).toBe(0)
    expect(porId['sem-prazo']).toBe(0.5)
  })

  it('item com unidade de outra grandeza não disputa preço', () => {
    const scores = calcularScores(
      [
        candidato({ cotacao_item_id: 'a', insumo_id: 'x', preco_unitario: 10, unidade: 'g' }),
        candidato({ cotacao_item_id: 'b', insumo_id: 'x', preco_unitario: 20, unidade: 'g' }),
        candidato({ cotacao_item_id: 'c', insumo_id: 'x', preco_unitario: 1, unidade: 'un' }),
      ],
      PESOS_PADRAO,
    )
    const c = scores.find((s) => s.cotacao_item_id === 'c')!
    expect(c.preco_comparavel).toBe(false)
    expect(scores.find((s) => s.cotacao_item_id === 'a')!.score).toBeGreaterThan(c.score)
  })

  it('pesos zerados caem no padrão em vez de gerar NaN', () => {
    const [s] = calcularScores(
      [candidato({ cotacao_item_id: 'a', insumo_id: 'x' })],
      { preco: 0, entrega: 0, pagamento: 0, frete: 0 },
    )
    expect(Number.isNaN(s.score)).toBe(false)
  })

  it('agruparPorInsumo ordena o melhor score primeiro', () => {
    const grupos = agruparPorInsumo(
      calcularScores(
        [
          candidato({ cotacao_item_id: 'caro', insumo_id: 'x', preco_unitario: 20 }),
          candidato({ cotacao_item_id: 'barato', insumo_id: 'x', preco_unitario: 10 }),
        ],
        PESOS_PADRAO,
      ),
    )
    expect(grupos[0].candidatos[0].cotacao_item_id).toBe('barato')
  })
})

describe('validarPesos', () => {
  it('aceita soma 100 e rejeita o resto', () => {
    expect(validarPesos(PESOS_PADRAO)).toBeNull()
    expect(validarPesos({ preco: 50, entrega: 20, pagamento: 20, frete: 0 })).not.toBeNull()
    expect(validarPesos({ preco: 120, entrega: -20, pagamento: 0, frete: 0 })).not.toBeNull()
  })
})
