import { describe, expect, it } from 'vitest'
import { numeroDigitado } from './numero'

describe('numeroDigitado', () => {
  it('entende vírgula decimal e ponto de milhar', () => {
    expect(numeroDigitado('1.234,5')).toBe(1234.5)
    expect(numeroDigitado('12,092')).toBe(12.092)
    expect(numeroDigitado('1.000')).toBe(1000)
    expect(numeroDigitado('10.000')).toBe(10000)
  })

  it('ponto que não é de milhar é decimal', () => {
    expect(numeroDigitado('93.95')).toBe(93.95)
    expect(numeroDigitado('1.5')).toBe(1.5)
    expect(numeroDigitado('250')).toBe(250)
  })

  it('vazio ou inválido é null', () => {
    expect(numeroDigitado('')).toBeNull()
    expect(numeroDigitado('abc')).toBeNull()
  })
})
