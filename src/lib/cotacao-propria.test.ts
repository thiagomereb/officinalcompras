import { describe, expect, it } from 'vitest'
import {
  concluirCotacaoPropria,
  conferirLeituraIa,
  lerCotacaoPropria,
  lerLinhasCotacaoPropria,
  linhasDaPagina,
  linhasParaIa,
  type LeituraParcial,
} from './cotacao-propria'

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

  it('EAN curto, produto repetido em linhas separadas e teor impossível', () => {
    const linhas = [
      '0047 1000005 - PARACETAMOL EXEMPLO (DC 90) [100.0000 %] 1.000,0000 g',
      '0000004000035 4000035 - CAPSULA Nº 00 1G (AZUL / BRANCA) 10.000,0000 u',
      '0000001005932 1005932 - PRODUTO EXEMPLO (USO INTERNO) [50100.0000 %] 50,0000 g',
      '0000004000035 4000035 - CAPSULA Nº 00 1G (AZUL / BRANCA) 20.000,0000 u',
    ]
    // O rodapé conta as 4 linhas; o produto repetido fica como veio, sem somar
    const r = lerCotacaoPropria([...cabecalho, ...linhas, 'TOTAL DE PRODUTOS:4'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.itens.map((i) => [i.codigo, i.ean, i.teor, i.quantidade, i.unidade])).toEqual([
      ['1000005', '0047', 100, 1000, 'g'],
      ['4000035', '0000004000035', null, 10000, 'un'],
      ['1005932', '0000001005932', null, 50, 'g'],
      ['4000035', '0000004000035', null, 20000, 'un'],
    ])
    expect(r.cotacao.avisos).toEqual([
      '1005932 - PRODUTO EXEMPLO (USO INTERNO): teor "50100.0000 %" no sistema; entra sem teor.',
    ])
  })

  it('mantém o produto repetido mesmo em unidades diferentes', () => {
    const r = lerCotacaoPropria([
      ...cabecalho,
      '0000004000035 4000035 - CAPSULA EXEMPLO 10.000,0000 u',
      '0000004000035 4000035 - CAPSULA EXEMPLO 10,0000 g',
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.itens.map((i) => [i.codigo, i.quantidade, i.unidade])).toEqual([
      ['4000035', 10000, 'un'],
      ['4000035', 10, 'g'],
    ])
  })
})

// Linhas fora do padrão (dados fictícios): sem o hífen, quantidade colada na
// unidade, quantidade na linha de baixo
const semHifen = '0000001000011 1000011 PRODUTO SEM HIFEN [98.5000 %] 250,0000 g'
const colada = 'SEM GTIN 1000012 - PRODUTO COLADO 1.500,0000g URGENTE'
const quebrada = '0000001000013 1000013 - PRODUTO DE NOME MUITO LONGO QUE'
const continuacao = 'CONTINUA EMBAIXO 2,5000 kg'

function parcialCom(linhas: string[]): LeituraParcial {
  const r = lerLinhasCotacaoPropria([...cabecalho, ...linhas])
  if (!r.ok) throw new Error(r.erro)
  return r.parcial
}

describe('leitura das linhas fora do padrão pela IA', () => {
  it('manda para a IA só quando falta produto para fechar com o rodapé', () => {
    const p = parcialCom([itens[0], semHifen, colada, quebrada, continuacao, 'TOTAL DE PRODUTOS: 4'])
    expect(linhasParaIa(p)).toEqual([
      { texto: semHifen, continuacao: null },
      { texto: colada, continuacao: null },
      { texto: quebrada, continuacao: continuacao },
    ])
    // Total já fechado: o que sobrou não é produto
    expect(linhasParaIa(parcialCom([itens[0], semHifen, 'TOTAL DE PRODUTOS: 1']))).toEqual([])
  })

  it('aceita o que está escrito na linha', () => {
    const [a, b, c] = linhasParaIa(parcialCom([semHifen, colada, quebrada, continuacao, 'TOTAL DE PRODUTOS: 3']))
    expect(
      conferirLeituraIa(a, { codigo: '1000011', ean: '0000001000011', nome: 'PRODUTO SEM HIFEN', teor: 98.5, quantidade: 250, unidade: 'g', observacao: null })?.item,
    ).toEqual({ codigo: '1000011', ean: '0000001000011', nome: 'PRODUTO SEM HIFEN', teor: 98.5, quantidade: 250, unidade: 'g', observacao: null })
    expect(
      conferirLeituraIa(b, { codigo: '1000012', ean: null, nome: 'PRODUTO COLADO', teor: null, quantidade: 1500, unidade: 'g', observacao: 'URGENTE' })?.item,
    ).toMatchObject({ quantidade: 1500, unidade: 'g', observacao: 'URGENTE' })
    // Unidade antes da quantidade
    const invertida = { texto: '0000001000014 1000014 - PRODUTO INVERTIDO g 500,0000', continuacao: null }
    expect(
      conferirLeituraIa(invertida, { codigo: '1000014', ean: null, nome: 'PRODUTO INVERTIDO', teor: null, quantidade: 500, unidade: 'g', observacao: null })?.item,
    ).toMatchObject({ quantidade: 500, unidade: 'g' })
    expect(conferirLeituraIa(invertida, { codigo: '1000014', ean: null, nome: 'PRODUTO INVERTIDO', teor: null, quantidade: 500.5, unidade: 'g', observacao: null })).toBeNull()
    // Nome e quantidade na linha de baixo
    expect(
      conferirLeituraIa(c, { codigo: '1000013', ean: '0000001000013', nome: 'PRODUTO DE NOME MUITO LONGO QUE CONTINUA EMBAIXO', teor: null, quantidade: 2.5, unidade: 'kg', observacao: null })?.item,
    ).toMatchObject({ nome: 'PRODUTO DE NOME MUITO LONGO QUE CONTINUA EMBAIXO', quantidade: 2.5, unidade: 'kg' })
  })

  it('recusa o que não está escrito na linha', () => {
    const [a] = linhasParaIa(parcialCom([semHifen, 'TOTAL DE PRODUTOS: 1']))
    const certo = { codigo: '1000011', ean: '0000001000011', nome: 'PRODUTO SEM HIFEN', teor: 98.5, quantidade: 250, unidade: 'g', observacao: null }
    expect(conferirLeituraIa(a, certo)).not.toBeNull()
    expect(conferirLeituraIa(a, { ...certo, codigo: '1000099' })).toBeNull()
    expect(conferirLeituraIa(a, { ...certo, quantidade: 2500 })).toBeNull()
    expect(conferirLeituraIa(a, { ...certo, unidade: 'kg' })).toBeNull()
    // O teor não é a quantidade
    expect(conferirLeituraIa(a, { ...certo, quantidade: 98.5 })).toBeNull()
    expect(conferirLeituraIa(a, { ...certo, nome: 'OUTRO PRODUTO' })).toBeNull()
    // EAN e teor inventados ficam de fora, o resto vale
    expect(conferirLeituraIa(a, { ...certo, ean: '7890000000000', teor: 50 })?.item).toMatchObject({ ean: null, teor: null })
  })

  it('junta o que a IA leu na posição da linha e confere com o rodapé', () => {
    const p = parcialCom([itens[0], semHifen, itens[1], 'TOTAL DE PRODUTOS: 3'])
    const [a] = linhasParaIa(p)
    const ia = conferirLeituraIa(a, { codigo: '1000011', ean: null, nome: 'PRODUTO SEM HIFEN', teor: 98.5, quantidade: 250, unidade: 'g', observacao: null })!
    const r = concluirCotacaoPropria(p, [ia])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.itens.map((i) => i.codigo)).toEqual(['1004426', '1000011', '1006716'])
    expect(r.cotacao.lidosPelaIa).toEqual([{ item: ia.item, linha: semHifen }])
  })

  it('aponta as linhas que nem a IA leu, com o motivo', () => {
    const p = parcialCom([itens[0], semHifen, 'TOTAL DE PRODUTOS: 2'])
    expect(concluirCotacaoPropria(p, [], 'A IA está com alta demanda agora.')).toEqual({
      ok: false,
      erro: `Li 1 produto(s), mas o relatório diz 2. Linha(s) que não consegui ler: "${semHifen}". A leitura dessas linhas pela IA também falhou: A IA está com alta demanda agora.`,
    })
  })

  it('sem rodapé, importa o que leu e avisa das linhas que sobraram', () => {
    const r = concluirCotacaoPropria(parcialCom([itens[0], semHifen]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cotacao.avisos).toEqual([`1 linha(s) parecem produto e não foram lidas: "${semHifen}".`])
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
