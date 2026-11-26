// As duas unidades da farmácia. Cada uma tem o seu código de produto no
// sistema da farmácia (o mesmo número pode ser um produto numa e outro na
// outra), guardado no insumo em codigo_goiania e codigo_rio_verde. Cada login é
// de uma unidade (tabela usuarios_unidade) e vê o código dela.

export type UnidadeFarmacia = 'goiania' | 'rio_verde'

export const UNIDADES_FARMACIA: { id: UnidadeFarmacia; nome: string; loja: string }[] = [
  { id: 'goiania', nome: 'Goiânia', loja: 'Marista' },
  { id: 'rio_verde', nome: 'Rio Verde', loja: 'Barrinha' },
]

export const nomeUnidade = (u: UnidadeFarmacia | null | undefined) =>
  UNIDADES_FARMACIA.find((x) => x.id === u)?.nome ?? 'sem unidade'

export const ehUnidadeFarmacia = (u: unknown): u is UnidadeFarmacia => u === 'goiania' || u === 'rio_verde'

// A unidade pelo texto do relatório da cotação ("FARMACIA OFFICINAL [MARISTA]",
// "FARMACIA OFFICINAL (RV) - UNIDADE 1 (BARRINHA)"): a mesma regra da função
// unidade_farmacia do banco
export function unidadeDaCotacao(texto: string | null | undefined): UnidadeFarmacia | null {
  const t = (texto ?? '').toUpperCase()
  if (/MARISTA|GOI[AÂ]NIA/.test(t)) return 'goiania'
  if (/BARRINHA|\(RV\)|RIO VERDE/.test(t)) return 'rio_verde'
  return null
}

// A coluna do insumo com o código da unidade
export const colunaCodigo = (u: UnidadeFarmacia): 'codigo_goiania' | 'codigo_rio_verde' =>
  u === 'goiania' ? 'codigo_goiania' : 'codigo_rio_verde'

export type CodigosInsumo = { codigo_goiania: string | null; codigo_rio_verde: string | null }

// O que gravar no insumo para pôr (ou tirar, com null) o código de uma unidade
export const comCodigo = (u: UnidadeFarmacia, codigo: string | null): Partial<CodigosInsumo> =>
  u === 'goiania' ? { codigo_goiania: codigo } : { codigo_rio_verde: codigo }

export const codigoNaUnidade = (insumo: CodigosInsumo, u: UnidadeFarmacia | null) =>
  u ? insumo[colunaCodigo(u)] : null
