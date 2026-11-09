import { normalizarUnidade } from './unidades'

// Orçamento do fornecedor lido pela IA (Edge Function ler-orcamento), página a
// página. A IA devolve o total do item e as embalagens; o preço por embalagem
// (e daí por g/mL) é calculado aqui, não pedido a ela.

export type CabecalhoOrcamento = {
  // Como o fornecedor se identifica no documento (marca e razão social)
  fornecedor_nome: string | null
  fornecedor_razao_social: string | null
  numero: string | null
  data: string | null
  cnpj: string | null
  validade_proposta: string | null
  pedido_minimo: number | null
  frete: 'CIF' | 'FOB' | null
  total_documento: number | null
}

export type ItemOrcamentoLido = {
  descricao: string
  embalagem_quantidade: number
  embalagem_unidade: string
  quantidade_embalagens: number
  valor_total: number
  validade: string | null
  pais_origem: string | null
  ipi: number | null
  st: number | null
  codigo_pedido: string | null
  obs: string | null
}

export type OrcamentoLido = { cabecalho: CabecalhoOrcamento; itens: ItemOrcamentoLido[] }

const texto = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const dataISO = (v: unknown): string | null => {
  const t = texto(v, 10)
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null
}

export function itemValido(raw: unknown): ItemOrcamentoLido | null {
  const i = (raw ?? {}) as Record<string, unknown>
  const descricao = texto(i.descricao, 500)
  const embalagem = numero(i.embalagem_quantidade)
  const unidade = texto(i.embalagem_unidade, 10)
  const embalagens = numero(i.quantidade_embalagens)
  const total = numero(i.valor_total)
  if (!descricao || !unidade || !(embalagem! > 0) || !(embalagens! > 0) || !(total! > 0)) return null
  const pct = (v: unknown) => {
    const n = numero(v)
    return n != null && n >= 0 && n <= 100 ? n : null
  }
  return {
    descricao,
    embalagem_quantidade: embalagem!,
    embalagem_unidade: unidade,
    quantidade_embalagens: embalagens!,
    valor_total: total!,
    validade: dataISO(i.validade),
    pais_origem: texto(i.pais_origem, 60),
    ipi: pct(i.ipi),
    st: pct(i.st),
    codigo_pedido: texto(i.codigo_pedido, 15),
    obs: texto(i.obs, 200),
  }
}

// Junta as respostas de cada página: o cabeçalho vem da primeira página que
// trouxer cada campo; o total do documento, da última (fica no fim)
export function unirPaginas(paginas: Record<string, unknown>[]): OrcamentoLido {
  const primeiro = <T>(f: (p: Record<string, unknown>) => T | null): T | null => {
    for (const p of paginas) {
      const v = f(p)
      if (v != null) return v
    }
    return null
  }
  const frete = primeiro((p) => {
    const f = texto(p.frete, 10)?.toUpperCase()
    return f === 'CIF' || f === 'FOB' ? f : null
  })
  const totais = paginas.map((p) => numero(p.total_documento)).filter((t): t is number => t != null && t > 0)

  return {
    cabecalho: {
      fornecedor_nome: primeiro((p) => texto(p.fornecedor_nome, 120)),
      fornecedor_razao_social: primeiro((p) => texto(p.fornecedor_razao_social, 160)),
      numero: primeiro((p) => texto(p.numero, 60)),
      data: primeiro((p) => dataISO(p.data)),
      cnpj: primeiro((p) => texto(p.cnpj, 30)),
      validade_proposta: primeiro((p) => texto(p.validade_proposta, 120)),
      pedido_minimo: primeiro((p) => {
        const n = numero(p.pedido_minimo)
        return n != null && n > 0 ? n : null
      }),
      frete,
      total_documento: totais.length ? totais[totais.length - 1] : null,
    },
    itens: paginas.flatMap((p) => (Array.isArray(p.itens) ? p.itens : [])).flatMap((i) => {
      const valido = itemValido(i)
      return valido ? [valido] : []
    }),
  }
}

// Como o item é gravado em cotacao_itens: preço de UMA embalagem
export function itemParaGravar(i: ItemOrcamentoLido) {
  return {
    preco_unitario: Math.round((i.valor_total / i.quantidade_embalagens) * 10000) / 10000,
    quantidade_minima: i.embalagem_quantidade,
    quantidade: i.quantidade_embalagens,
    unidade: normalizarUnidade(i.embalagem_unidade),
  }
}

export type ConferenciaTotal = { soma: number; somaComImpostos: number; bate: boolean | null }

// O documento pode trazer o total com ou sem impostos; bate se qualquer um dos
// dois fechar (tolerância de arredondamento)
export function conferirTotal(itens: ItemOrcamentoLido[], total: number | null): ConferenciaTotal {
  const soma = itens.reduce((s, i) => s + i.valor_total, 0)
  const somaComImpostos = itens.reduce((s, i) => s + i.valor_total * (1 + ((i.ipi ?? 0) + (i.st ?? 0)) / 100), 0)
  if (total == null) return { soma, somaComImpostos, bate: null }
  const tolerancia = Math.max(0.1, total * 0.001)
  return {
    soma,
    somaComImpostos,
    bate: Math.abs(soma - total) <= tolerancia || Math.abs(somaComImpostos - total) <= tolerancia,
  }
}

export const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// Chave de comparação de uma descrição com sinônimos já confirmados (sem
// diferenciar acento, maiúscula nem espaços)
export const chaveDescricao = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
