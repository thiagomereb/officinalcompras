import { describe, expect, it } from 'vitest'
import { reconhecerFornecedor, type FornecedorCadastro } from './reconhecer-fornecedor'

// Dados fictícios (nomes e CNPJs inventados)
const f = (id: string, razao_social: string, cnpj: string | null = null): FornecedorCadastro => ({
  id,
  razao_social,
  nome_fantasia: null,
  cnpj,
  codigo: id,
})

const cadastro = [
  f('1', 'ALFA EMPREENDIMENTOS FARMACEUTICOS LTDA (11.222.333/0007-01)', '11.222.333/0007-01'),
  f('2', 'ALFA EMPREENDIMENTOS FARMACEUTICOS LTDA.(PUREMED)', '11.222.333/0025-93'),
  f('3', 'BRAVA - ALFA EMPREENDIMENTOS FARMACEUTICOS LTDA', '11.222.333/0012-79'),
  f('4', 'VIALE INDUSTRIA DE INSUMOS FARMACEUTICOS LTDA', '11.222.333/0017-83'),
  f('5', 'BETA QUIMICA FARMACEUTICA LTDA'),
  f('6', 'GAMA INSUMOS FARMACEUTICOS LTDA', '55.666.777/0001-00'),
  f('7', 'GAMA INSUMOS FARMACEUTICOS LTDA', '55.666.777/0001-00'),
  f('8', 'FARMACIA SAO LUIZ'),
]

describe('reconhecerFornecedor', () => {
  it('CNPJ exato e único decide', () => {
    expect(reconhecerFornecedor(cadastro, '11.222.333/0025-93', '')).toMatchObject({ id: '2', motivo: 'cnpj' })
  })

  it('mesma raiz de CNPJ: o nome do cabeçalho escolhe a empresa', () => {
    const cab = 'Orçamento Alfa Brasil - CNPJ 11.222.333/0016-00 Alfa Empreendimentos Farmaceuticos LTDA Cliente: Farmacia Exemplo'
    const r = reconhecerFornecedor(cadastro, '11.222.333/0016-00', cab)
    expect(r).toMatchObject({ id: '1', motivo: 'nome' })
    // As outras do grupo ficam à vista para trocar
    expect(r.alternativas.map((x) => x.id).sort()).toEqual(['2', '3', '4'])
  })

  it('palavra rara do nome decide entre empresas do grupo', () => {
    const r = reconhecerFornecedor(cadastro, '11.222.333/0099-00', 'BRAVA Insumos - Alfa Empreendimentos Farmaceuticos')
    expect(r).toMatchObject({ id: '3', motivo: 'nome' })
  })

  it('sem CNPJ no cadastro: reconhece pelo nome', () => {
    expect(reconhecerFornecedor(cadastro, '99.888.777/0001-90', 'Beta Quimica e Farmaceutica Ltda — Orçamento N° 123')).toMatchObject({
      id: '5',
      motivo: 'nome',
    })
  })

  it('mesmo nome e mesmo CNPJ: escolhe um e mostra o outro', () => {
    const r = reconhecerFornecedor(cadastro, '55.666.777/0001-00', 'Gama Insumos Farmaceuticos')
    expect(r.motivo).toBe('nome')
    expect([r.id, ...r.alternativas.map((x) => x.id)].sort()).toEqual(['6', '7'])
  })

  it('não chuta quando só palavras comuns batem', () => {
    expect(reconhecerFornecedor(cadastro, null, 'Farmacia Exemplo - pedido de insumos farmaceuticos')).toMatchObject({ id: '', motivo: null })
  })
})
