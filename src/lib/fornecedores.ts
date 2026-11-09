// Tipos de fornecedor do sistema da farmácia (relatório [238]). Os de compra de
// insumos são os que o orçamento oferece e reconhece; os outros (transportadora,
// serviços, "outros") ficam no cadastro, fora dessa escolha.
export const TIPOS_FORNECEDOR = [
  'MATÉRIA PRIMA',
  'EMBALAGENS',
  'PRODUTOS INDUSTRIALIZADOS',
  'MÁQUINAS/ EQUIPAMENTOS',
  'SERVIÇOS',
  'TRANSPORTADORA',
  'OUTROS',
] as const

export const TIPOS_COMPRA: readonly string[] = ['MATÉRIA PRIMA', 'EMBALAGENS', 'PRODUTOS INDUSTRIALIZADOS']

// Sem tipo (cadastrado à mão aqui) também vale para compra
export const ehFornecedorDeCompra = (tipo: string | null | undefined) => !tipo || TIPOS_COMPRA.includes(tipo)
