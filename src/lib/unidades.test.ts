import { describe, expect, it } from 'vitest'
import { normalizarUnidade, precoPorUnidadeBase } from './unidades'

describe('normalizarUnidade', () => {
  it('padroniza variações comuns', () => {
    expect(normalizarUnidade('G')).toBe('g')
    expect(normalizarUnidade('GR')).toBe('g')
    expect(normalizarUnidade('Kg')).toBe('kg')
    expect(normalizarUnidade('ML')).toBe('mL')
    expect(normalizarUnidade('lts')).toBe('L')
    expect(normalizarUnidade(' cápsulas ')).toBe('cáps')
  })

  it('mantém unidades desconhecidas e trata vazio como nulo', () => {
    expect(normalizarUnidade('frasco')).toBe('frasco')
    expect(normalizarUnidade('  ')).toBeNull()
    expect(normalizarUnidade(null)).toBeNull()
  })
})

describe('precoPorUnidadeBase', () => {
  it('converte massa e volume para g e mL', () => {
    expect(precoPorUnidadeBase(100, 1, 'kg')).toEqual({ valor: 0.1, base: 'g' })
    expect(precoPorUnidadeBase(50, 500, 'mg')).toEqual({ valor: 100, base: 'g' })
    expect(precoPorUnidadeBase(30, 2, 'L')).toEqual({ valor: 0.015, base: 'mL' })
  })

  it('respeita embalagens fracionadas', () => {
    // Antes Math.max(q, 1) tratava 0,5 kg como 1 kg
    expect(precoPorUnidadeBase(50, 0.5, 'kg').valor).toBeCloseTo(0.1)
  })

  it('sem tamanho de embalagem assume preço por unidade', () => {
    expect(precoPorUnidadeBase(12, null, 'un')).toEqual({ valor: 12, base: 'un' })
  })
})
