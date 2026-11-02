// Formas canônicas de unidade usadas no banco. O prompt do OCR pede exatamente
// estas formas, mas planilhas e digitação manual trazem variações ("GR", "Kg",
// "lts"), então tudo passa por normalizarUnidade antes de ser gravado.
const SINONIMOS_UNIDADE: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
  mg: 'mg', miligrama: 'mg', miligramas: 'mg',
  kg: 'kg', kgs: 'kg', kilo: 'kg', quilo: 'kg', quilograma: 'kg', quilogramas: 'kg',
  ml: 'mL', mililitro: 'mL', mililitros: 'mL',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L',
  mcg: 'mcg', µg: 'mcg', ug: 'mcg', micrograma: 'mcg', microgramas: 'mcg',
  ui: 'UI', un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
  caps: 'cáps', cáps: 'cáps', capsula: 'cáps', cápsula: 'cáps', capsulas: 'cáps', cápsulas: 'cáps',
  comp: 'comp', comprimido: 'comp', comprimidos: 'comp',
}

export function normalizarUnidade(u: string | null | undefined): string | null {
  if (!u) return null
  const limpo = u.trim()
  if (!limpo) return null
  return SINONIMOS_UNIDADE[limpo.toLowerCase()] ?? limpo
}

// Converte cada unidade para a base da sua grandeza (massa → g, volume → mL),
// para que "1 kg a R$100" e "100 g a R$15" sejam comparados em R$/g. Unidades
// de contagem (un, cáps, UI...) ficam como estão: cada uma é sua própria base.
const PARA_BASE: Record<string, { base: string; fator: number }> = {
  mcg: { base: 'g', fator: 0.000001 },
  mg: { base: 'g', fator: 0.001 },
  g: { base: 'g', fator: 1 },
  kg: { base: 'g', fator: 1000 },
  mL: { base: 'mL', fator: 1 },
  L: { base: 'mL', fator: 1000 },
}

export type PrecoBase = {
  // Preço por 1 unidade da base (R$/g, R$/mL ou R$/un...)
  valor: number
  // Unidade base em que `valor` está expresso; null quando a unidade é desconhecida
  base: string | null
}

// preco é o preço da embalagem; quantidadeEmbalagem é o tamanho dela na
// `unidade` informada (ex: 500 para "500 g"). Sem tamanho, assume que o preço
// já é por 1 unidade.
export function precoPorUnidadeBase(
  preco: number,
  quantidadeEmbalagem: number | null,
  unidade: string | null,
): PrecoBase {
  const qtd = quantidadeEmbalagem && quantidadeEmbalagem > 0 ? quantidadeEmbalagem : 1
  const u = normalizarUnidade(unidade)
  const conv = u ? PARA_BASE[u] : undefined
  if (conv) return { valor: preco / (qtd * conv.fator), base: conv.base }
  return { valor: preco / qtd, base: u }
}

export function formatarPrecoBase({ valor, base }: PrecoBase): string {
  const casas = valor < 1 ? 4 : 2
  const texto = valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
  return base ? `${texto}/${base}` : texto
}
