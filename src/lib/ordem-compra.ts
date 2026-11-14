import { quantidadeEmBase } from './unidades'

// Ordem de compra no formato do pedido do ERP ([420] PEDIDO DE COMPRA): uma
// por fornecedor, com os itens escolhidos no mapa. Quantidade e valor
// unitário vão na unidade base (g, mL, un), e o total é quantidade × unitário.

export type EscolhaParaOrdem = {
  insumo_id: string
  insumo_nome: string
  fornecedor: string
  // Preço por unidade base da oferta escolhida
  preco_base: number | null
  unidade_base: string | null
  validade: string | null
  // Quantidade de compra informada no mapa
  quantidade: number | null
  quantidade_unidade: string | null
  // Valor gravado na aprovação (mapa aprovado); no rascunho é calculado
  valor_total: number | null
  prazo_entrega_dias: number | null
  prazo_pagamento_dias: number | null
}

export type ProdutoDaCotacao = {
  codigo: string
  nome: string
  teor: number | null
  quantidade: number
  unidade: string
  insumo_id: string
}

export type LinhaOrdem = {
  produto: string
  validade: string | null
  // Na unidade base (g, mL, un)
  quantidade: number | null
  unidade: string | null
  precoUnitario: number | null
  total: number | null
}

export type OrdemFornecedor = {
  // Identifica o fornecedor no link de download
  chave: string
  fornecedor: string
  linhas: LinhaOrdem[]
  total: number
  // Alguma linha sem valor (quantidade em outra grandeza que a oferta)
  incompleto: boolean
  prazoEntregaDias: number | null
  prazoPagamentoDias: number | null
}

const centavos = (v: number) => Math.round(v * 100) / 100
const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })

function slug(texto: string) {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'fornecedor'
  )
}

// "1000765 - TIREOIDE DESSECADA [100.00 %]", como no pedido do ERP
export function rotuloProduto(p: Pick<ProdutoDaCotacao, 'codigo' | 'nome' | 'teor'>) {
  return `${p.codigo} - ${p.nome}${p.teor != null ? ` [${p.teor.toFixed(2)} %]` : ''}`
}

function linha(e: EscolhaParaOrdem, pedido: ProdutoDaCotacao | undefined): LinhaOrdem {
  // A quantidade do mapa vale; sem ela, a pedida na cotação própria
  const q =
    e.quantidade != null && e.quantidade > 0
      ? quantidadeEmBase(e.quantidade, e.quantidade_unidade)
      : pedido && pedido.quantidade > 0
        ? quantidadeEmBase(pedido.quantidade, pedido.unidade)
        : null
  const mesmaGrandeza = !!q?.base && q.base === e.unidade_base && e.preco_base != null
  const total = e.valor_total ?? (mesmaGrandeza ? centavos(q!.valor * e.preco_base!) : null)
  return {
    produto: pedido ? rotuloProduto(pedido) : e.insumo_nome,
    validade: e.validade,
    quantidade: q?.valor ?? null,
    unidade: q?.base ?? null,
    precoUnitario: e.preco_base,
    total,
  }
}

export function montarOrdens(escolhas: EscolhaParaOrdem[], pedidos: ProdutoDaCotacao[]): OrdemFornecedor[] {
  // Ordem dos produtos na cotação própria; o que não foi pedido vai no fim
  const posicao = new Map<string, number>()
  pedidos.forEach((p, i) => {
    if (!posicao.has(p.insumo_id)) posicao.set(p.insumo_id, i)
  })
  const pedidoPorInsumo = new Map(pedidos.map((p) => [p.insumo_id, p] as const).reverse())

  const porFornecedor = new Map<string, EscolhaParaOrdem[]>()
  for (const e of escolhas) porFornecedor.set(e.fornecedor, [...(porFornecedor.get(e.fornecedor) ?? []), e])

  const chaves = new Set<string>()
  return [...porFornecedor.keys()].sort(porNome).map((fornecedor) => {
    const itens = porFornecedor
      .get(fornecedor)!
      .sort(
        (a, b) =>
          (posicao.get(a.insumo_id) ?? Infinity) - (posicao.get(b.insumo_id) ?? Infinity) ||
          porNome(a.insumo_nome, b.insumo_nome),
      )
    const linhas = itens.map((e) => linha(e, pedidoPorInsumo.get(e.insumo_id)))

    let chave = slug(fornecedor)
    for (let n = 2; chaves.has(chave); n++) chave = `${slug(fornecedor)}-${n}`
    chaves.add(chave)

    return {
      chave,
      fornecedor,
      linhas,
      total: centavos(linhas.reduce((s, l) => s + (l.total ?? 0), 0)),
      incompleto: linhas.some((l) => l.total == null),
      prazoEntregaDias: itens.find((e) => e.prazo_entrega_dias != null)?.prazo_entrega_dias ?? null,
      prazoPagamentoDias: itens.find((e) => e.prazo_pagamento_dias != null)?.prazo_pagamento_dias ?? null,
    }
  })
}
