import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { extrairItensExcel, formatarData } from './excel'

function planilha(linhas: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Tabela')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('formatarData', () => {
  it('lê texto no formato brasileiro como dia/mês', () => {
    expect(formatarData('01/05/2027')).toBe('2027-05-01')
    expect(formatarData('1/5/27')).toBe('2027-05-01')
    expect(formatarData('31.12.2026')).toBe('2026-12-31')
  })

  it('aceita ISO, mês/ano e células de data', () => {
    expect(formatarData('2027-05-01')).toBe('2027-05-01')
    expect(formatarData('02/2027')).toBe('2027-02-28')
    expect(formatarData(new Date(2027, 4, 1))).toBe('2027-05-01')
  })

  it('rejeita datas impossíveis em vez de corrigi-las', () => {
    expect(formatarData('31/02/2027')).toBeNull()
    expect(formatarData('abc')).toBeNull()
  })
})

describe('extrairItensExcel', () => {
  it('mapeia cabeçalhos variados e converte números BR', () => {
    const itens = extrairItensExcel(
      planilha([
        ['Produto', 'Embalagem', 'Unid.', 'Valor Unit.', 'Validade'],
        ['Ácido Ascórbico', 1, 'KG', '1.200,50', '01/05/2027'],
        ['Total', null, null, null, null],
      ]),
    )
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({
      descricao: 'Ácido Ascórbico',
      quantidade_embalagem: 1,
      unidade: 'KG',
      preco_unitario: 1200.5,
      validade: '2027-05-01',
    })
  })
})
