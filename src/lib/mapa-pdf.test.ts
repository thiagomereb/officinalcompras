import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { gerarMapaPdf } from './mapa-pdf'
import type { DocumentoMapa } from './mapas'
import type { CandidatoItem } from './comparacao'

// Dados fictícios
const candidato = (id: string, fornecedor: string, preco: number): CandidatoItem => ({
  cotacao_item_id: id,
  cotacao_id: 'c-' + fornecedor,
  insumo_id: 'acido',
  insumo_nome: 'ÁCIDO BÓRICO',
  fornecedor_nome: fornecedor,
  preco_unitario: preco,
  unidade: 'g',
  quantidade_minima: 1000,
  lote: null,
  validade: null,
  prazo_entrega_dias: null,
  prazo_pagamento_dias: null,
  frete_fixo: null,
  frete_gratis_acima: null,
  pedido_minimo: null,
  preco_base: preco / 1000,
  unidade_base: 'g',
  preco_comparavel: true,
})

function documento(produtos: number, fornecedores: number): DocumentoMapa {
  const nomes = Array.from({ length: fornecedores }, (_, i) => `FORNECEDOR EXEMPLO ${i + 1} LTDA`)
  return {
    mapa: { titulo: 'Cotação 1 → teste ✓', status: 'rascunho', aprovado_em: null, cancelado_em: null } as DocumentoMapa['mapa'],
    orcamentos: fornecedores,
    cotacaoPropria: { numero: '261100001' },
    pedidos: Array.from({ length: produtos }, (_, i) => ({
      codigo: String(1000000 + i),
      nome: i === 0 ? 'PRODUTO COM NOME BEM LONGO QUE PRECISA QUEBRAR EM MAIS DE UMA LINHA NO MAPA IMPRESSO DE COTAÇÃO ' + 'X'.repeat(80) : `PRODUTO ${i}`,
      quantidade: 500,
      unidade: 'g',
      insumo_id: i === 1 ? 'acido' : `insumo-${i}`,
    })),
    fornecedores: nomes,
    grupos: [{ insumo_id: 'acido', insumo_nome: 'ÁCIDO BÓRICO', candidatos: [candidato('a', nomes[0], 100), candidato('b', nomes[1], 80)] }],
    escolhas: new Map([['acido', { cotacao_item_id: 'b', quantidade: 1000, quantidade_unidade: 'g' }]]),
  }
}

describe('gerarMapaPdf', () => {
  it('gera o PDF de um mapa grande depressa, com caractere fora da fonte e nome longo', async () => {
    const inicio = Date.now()
    const bytes = await gerarMapaPdf(documento(160, 30), '26/11/2026 10:00')
    expect(Date.now() - inicio).toBeLessThan(5000)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(10)
    expect(pdf.getTitle()).toContain('Mapa de cotação')
  })

  it('mapa sem produtos sai com uma página', async () => {
    const doc = { ...documento(0, 3), grupos: [] }
    const pdf = await PDFDocument.load(await gerarMapaPdf(doc, '26/11/2026 10:00'))
    expect(pdf.getPageCount()).toBe(1)
  })
})
