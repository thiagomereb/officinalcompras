import { describe, expect, it } from 'vitest'
import { lerCotacaoPropria, linhasDaPagina } from './cotacao-propria'

// Linhas como saem de linhasDaPagina para o relatório do sistema (dados fictícios)
const cabecalho = [
  '[ 90 ] - PRODUTOS PARA COTAÇAO 5 - 05/11/2026 16:02:46',
  'FAVOR ENVIAR A SEGUINTE COTAÇÃO PARA: FARMACIA EXEMPLO [CENTRO]',
  'CNPJ: 00000000000000',
  '*** OBSERVAÇÃO DA COTAÇÃO ***',
  'COTAÇÃO: 261100007',
  'EAN CÓDIGO - NOME DO PRODUTO FRAÇÃO C/V QUANTIDADE VALOR OBSERVAÇÃO',
]
const itens = [
  '0000001004426 1004426 - 3 INDOL CARBINOL [100.0000 %] 12,0920 g',
  '07908052860272 1006716 - COLAGENEW - COLAGENO TRIPEPTIDEOS [93.9500 %] 195,3800 g',
  'SEM GTIN 1006272 - CORE BIOME PLUS [100.0000 %] 13,5450 g',
  '0000001006589 1006589 - LOCAO HID ALOE VERA E AMENDOAS [100.0000 %] 2.992,5000 g',
  '0000001000057 1000057 - ALCACHOFRA EXT. SECO PURO (S/ CONVERSAO) (CYNARA SCOLYMUS/ C [ 1.000,0000 g',
]

describe('lerCotacaoPropria', () => {
  it('lê cabeçalho e produtos', () => {
    const r = lerCotacaoPropria([...cabecalho, ...itens, 'TOTAL DE PRODUTOS: 5'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao).toMatchObject({
      numero: '261100007',
      unidade: 'FARMACIA EXEMPLO [CENTRO]',
      emitidaEm: '2026-11-05T16:02:46-03:00',
    })
    expect(r.cotacao.itens).toEqual([
      { codigo: '1004426', ean: '0000001004426', nome: '3 INDOL CARBINOL', teor: 100, quantidade: 12.092, unidade: 'g' },
      // Hífen dentro do nome e EAN de 14 dígitos
      { codigo: '1006716', ean: '07908052860272', nome: 'COLAGENEW - COLAGENO TRIPEPTIDEOS', teor: 93.95, quantidade: 195.38, unidade: 'g' },
      { codigo: '1006272', ean: null, nome: 'CORE BIOME PLUS', teor: 100, quantidade: 13.545, unidade: 'g' },
      // Milhar com ponto
      { codigo: '1006589', ean: '0000001006589', nome: 'LOCAO HID ALOE VERA E AMENDOAS', teor: 100, quantidade: 2992.5, unidade: 'g' },
      // Teor cortado pelo relatório
      { codigo: '1000057', ean: '0000001000057', nome: 'ALCACHOFRA EXT. SECO PURO (S/ CONVERSAO) (CYNARA SCOLYMUS/ C', teor: null, quantidade: 1000, unidade: 'g' },
    ])
  })

  it('recusa quando o total do rodapé não bate', () => {
    const r = lerCotacaoPropria([...cabecalho, ...itens, 'TOTAL DE PRODUTOS: 6'])
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('Li 5 produto(s), mas o relatório diz 6') })
  })

  it('recusa outro tipo de PDF e código repetido', () => {
    expect(lerCotacaoPropria(['TABELA DE PREÇOS', ...itens]).ok).toBe(false)
    expect(lerCotacaoPropria([...cabecalho, itens[0], itens[0]])).toEqual({
      ok: false,
      erro: 'O produto 1004426 aparece duas vezes no relatório.',
    })
  })
})

describe('linhasDaPagina', () => {
  it('junta os pedaços da mesma altura, da esquerda para a direita', () => {
    expect(
      linhasDaPagina([
        { str: '12,0920', x: 619.5, y: 414.8 },
        { str: '0000001004426', x: 29.3, y: 414.8 },
        { str: ' ', x: 94.3, y: 414.8 },
        { str: 'COTAÇÃO: 261100007', x: 30, y: 448.5 },
        { str: 'g', x: 659.3, y: 414.6 },
        { str: '1004426 - 3 INDOL CARBINOL [100.0000 %]', x: 111.8, y: 414.8 },
      ]),
    ).toEqual(['COTAÇÃO: 261100007', '0000001004426 1004426 - 3 INDOL CARBINOL [100.0000 %] 12,0920 g'])
  })
})
