import { describe, expect, it } from 'vitest'
import { formatarCas, normalizarCas } from './cas'

describe('normalizarCas', () => {
  it('aceita com ou sem hífens e devolve no formato padrão', () => {
    expect(normalizarCas('50-81-7')).toEqual({ ok: true, cas: '50-81-7' })
    expect(normalizarCas(' 7732-18-5 ')).toEqual({ ok: true, cas: '7732-18-5' })
    // Como vem das planilhas: só dígitos, com zeros à esquerda
    expect(normalizarCas('0016856181')).toEqual({ ok: true, cas: '16856-18-1' })
    expect(normalizarCas('0000050817')).toEqual({ ok: true, cas: '50-81-7' })
  })

  it('recusa dígito verificador errado e diz qual seria', () => {
    const r = normalizarCas('50-81-8')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain('seria 7')
  })

  it('vazio limpa o campo e texto livre fica como veio', () => {
    expect(normalizarCas('   ')).toEqual({ ok: true, cas: null })
    expect(normalizarCas('N/A')).toEqual({ ok: true, cas: 'N/A' })
    expect(normalizarCas('56-81-5 / 7732-18-5')).toEqual({ ok: true, cas: '56-81-5 / 7732-18-5' })
  })
})

describe('formatarCas', () => {
  it('formata o válido e mantém o resto como veio', () => {
    expect(formatarCas('0084929419')).toBe('84929-41-9')
    expect(formatarCas('50-81-8')).toBe('50-81-8')
    expect(formatarCas(null)).toBeNull()
  })
})
