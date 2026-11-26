import { describe, expect, it } from 'vitest'
import { codigoNaUnidade, comCodigo, unidadeDaCotacao } from './unidades-farmacia'

describe('unidadeDaCotacao', () => {
  it('reconhece a unidade pelo cabeçalho do relatório', () => {
    expect(unidadeDaCotacao('FARMACIA OFFICINAL [MARISTA]')).toBe('goiania')
    expect(unidadeDaCotacao('FARMACIA OFFICINAL (RV) - UNIDADE 1 (BARRINHA)')).toBe('rio_verde')
    expect(unidadeDaCotacao('Farmácia Officinal Goiânia')).toBe('goiania')
    expect(unidadeDaCotacao('Farmacia Officinal Rio Verde')).toBe('rio_verde')
  })

  it('sem cabeçalho conhecido, sem unidade', () => {
    expect(unidadeDaCotacao(null)).toBeNull()
    expect(unidadeDaCotacao('FARMACIA EXEMPLO [CENTRO]')).toBeNull()
  })
})

describe('código por unidade', () => {
  const insumo = { codigo_goiania: '4000055', codigo_rio_verde: '4000132' }
  it('lê e grava o campo da unidade', () => {
    expect(codigoNaUnidade(insumo, 'goiania')).toBe('4000055')
    expect(codigoNaUnidade(insumo, 'rio_verde')).toBe('4000132')
    expect(codigoNaUnidade(insumo, null)).toBeNull()
    expect(comCodigo('rio_verde', null)).toEqual({ codigo_rio_verde: null })
  })
})
