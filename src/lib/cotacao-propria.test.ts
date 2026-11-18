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
      { codigo: '1004426', ean: '0000001004426', nome: '3 INDOL CARBINOL', teor: 100, quantidade: 12.092, unidade: 'g', observacao: null },
      // Hífen dentro do nome e EAN de 14 dígitos
      { codigo: '1006716', ean: '07908052860272', nome: 'COLAGENEW - COLAGENO TRIPEPTIDEOS', teor: 93.95, quantidade: 195.38, unidade: 'g', observacao: null },
      { codigo: '1006272', ean: null, nome: 'CORE BIOME PLUS', teor: 100, quantidade: 13.545, unidade: 'g', observacao: null },
      // Milhar com ponto
      { codigo: '1006589', ean: '0000001006589', nome: 'LOCAO HID ALOE VERA E AMENDOAS', teor: 100, quantidade: 2992.5, unidade: 'g', observacao: null },
      // Teor cortado pelo relatório
      { codigo: '1000057', ean: '0000001000057', nome: 'ALCACHOFRA EXT. SECO PURO (S/ CONVERSAO) (CYNARA SCOLYMUS/ C', teor: null, quantidade: 1000, unidade: 'g', observacao: null },
    ])
  })

  it('lê a coluna OBSERVAÇÃO, EAN com letras e número no meio do nome', () => {
    const linhas = [
      '7908621415605 1004084 - ACETIL L-CARNITINA [100.0000 %] 500,0000 g URGENTE',
      'G60CS000354I 4000545 - CAPSULA VEGETAL 00 BRANCA 5.000,0000 u',
      // "1,5%" do nome não é a quantidade
      '0000001003703 1003703 - ASHWAGANDHA EXTRATO SECO 1,5% WITANOLIDEOS [100.0000 %] 1.000,0000 g',
      '0000001006422 1006422 - CAPSULA DE OLEO 1000MG + VITAMINA E [100.0000 %] 1.000,0000 u URGENTE',
    ]
    const r = lerCotacaoPropria([...cabecalho, ...linhas, 'TOTAL DE PRODUTOS:4'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.itens.map((i) => [i.codigo, i.ean, i.nome, i.quantidade, i.unidade, i.observacao])).toEqual([
      ['1004084', '7908621415605', 'ACETIL L-CARNITINA', 500, 'g', 'URGENTE'],
      ['4000545', 'G60CS000354I', 'CAPSULA VEGETAL 00 BRANCA', 5000, 'un', null],
      ['1003703', '0000001003703', 'ASHWAGANDHA EXTRATO SECO 1,5% WITANOLIDEOS', 1000, 'g', null],
      ['1006422', '0000001006422', 'CAPSULA DE OLEO 1000MG + VITAMINA E', 1000, 'un', 'URGENTE'],
    ])
  })

  it('tira a fração C/V dos produtos acabados do nome', () => {
    const acabados = [
      '0000003026998 3026998 - PRODUTO EXEMPLO 500MG 90 DOSES / 180 CAPSULAS (LINHA EXEMPLO) 1/ 1 2,0000 u',
      // Nome cortado pelo relatório: a fração vem colada
      '0000003027059 3027059 - COMPOSTO EXEMPLO 30 DOSES(120CAPS) LINHA EXEMPLO1/ 1 1,0000 u',
      '0000003028619 3028619 - PO EXEMPLO 90G SEM SABOR (LINHA EXEMPLO) 0/ 0 1,0000 u',
      // Barra que é do nome continua
      '0000003000001 3000001 - SOLUCAO EXEMPLO 1/2 [100.0000 %] 1/ 1 3,0000 un',
    ]
    const r = lerCotacaoPropria([...cabecalho, ...acabados, 'TOTAL DE PRODUTOS: 4'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.itens.map((i) => [i.nome, i.teor, i.quantidade, i.unidade])).toEqual([
      ['PRODUTO EXEMPLO 500MG 90 DOSES / 180 CAPSULAS (LINHA EXEMPLO)', null, 2, 'un'],
      ['COMPOSTO EXEMPLO 30 DOSES(120CAPS) LINHA EXEMPLO', null, 1, 'un'],
      ['PO EXEMPLO 90G SEM SABOR (LINHA EXEMPLO)', null, 1, 'un'],
      ['SOLUCAO EXEMPLO 1/2', 100, 3, 'un'],
    ])
  })

  it('recusa quando o total do rodapé não bate', () => {
    const r = lerCotacaoPropria([...cabecalho, ...itens, 'TOTAL DE PRODUTOS: 6'])
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('Li 5 produto(s), mas o relatório diz 6') })
  })

  it('recusa outro tipo de PDF', () => {
    expect(lerCotacaoPropria(['TABELA DE PREÇOS', ...itens]).ok).toBe(false)
  })

  it('aponta as linhas que não leu quando o total não bate', () => {
    const r = lerCotacaoPropria([...cabecalho, itens[0], '0000001000001 1000001 - PRODUTO SEM QUANTIDADE', 'TOTAL DE PRODUTOS: 2'])
    expect(r).toEqual({
      ok: false,
      erro: 'Li 1 produto(s), mas o relatório diz 2. Linha(s) que não consegui ler: "0000001000001 1000001 - PRODUTO SEM QUANTIDADE".',
    })
  })

  it('EAN curto, produto repetido somado e teor impossível', () => {
    const linhas = [
      '0047 1000005 - PARACETAMOL EXEMPLO (DC 90) [100.0000 %] 1.000,0000 g',
      '0000004000035 4000035 - CAPSULA Nº 00 1G (AZUL / BRANCA) 10.000,0000 u',
      '0000001005932 1005932 - PRODUTO EXEMPLO (USO INTERNO) [50100.0000 %] 50,0000 g',
      '0000004000035 4000035 - CAPSULA Nº 00 1G (AZUL / BRANCA) 20.000,0000 u',
    ]
    // O rodapé conta as 4 linhas, mesmo com o produto repetido
    const r = lerCotacaoPropria([...cabecalho, ...linhas, 'TOTAL DE PRODUTOS:4'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.itens.map((i) => [i.codigo, i.ean, i.teor, i.quantidade, i.unidade])).toEqual([
      ['1000005', '0047', 100, 1000, 'g'],
      ['4000035', '0000004000035', null, 30000, 'un'],
      ['1005932', '0000001005932', null, 50, 'g'],
    ])
    expect(r.cotacao.avisos).toEqual([
      '1005932 - PRODUTO EXEMPLO (USO INTERNO): teor "50100.0000 %" no sistema; entra sem teor.',
      '4000035 - CAPSULA Nº 00 1G (AZUL / BRANCA) aparece 2 vezes: quantidades somadas (10.000 + 20.000 = 30.000 un).',
    ])
  })

  it('recusa produto repetido em unidades diferentes', () => {
    const r = lerCotacaoPropria([
      ...cabecalho,
      '0000004000035 4000035 - CAPSULA EXEMPLO 10.000,0000 u',
      '0000004000035 4000035 - CAPSULA EXEMPLO 10,0000 g',
    ])
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('em unidades diferentes (un e g)') })
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
