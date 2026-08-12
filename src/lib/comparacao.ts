export type Pesos = {
  preco: number
  entrega: number
  pagamento: number
  frete: number
}

export const PESOS_PADRAO: Pesos = { preco: 50, entrega: 20, pagamento: 20, frete: 10 }

export type CandidatoItem = {
  cotacao_item_id: string
  cotacao_id: string
  insumo_id: string
  insumo_nome: string
  fornecedor_nome: string
  preco_unitario: number
  unidade: string | null
  quantidade_minima: number | null
  lote: string | null
  validade: string | null
  prazo_entrega_dias: number | null
  prazo_pagamento_dias: number | null
  frete_fixo: number | null
  frete_gratis_acima: number | null
  pedido_minimo: number | null
  score: number
}

export type GrupoInsumo = {
  insumo_id: string
  insumo_nome: string
  candidatos: CandidatoItem[]
}

function norm(val: number, min: number, max: number): number {
  if (max === min) return 0.5
  return (val - min) / (max - min)
}

export function calcularScores(candidatos: Omit<CandidatoItem, 'score'>[], pesos: Pesos): CandidatoItem[] {
  // Normaliza preço por tamanho de embalagem para comparação justa entre fornecedores
  const precos = candidatos.map((c) => c.preco_unitario / Math.max(c.quantidade_minima ?? 1, 1))
  const entregas = candidatos.map((c) => c.prazo_entrega_dias ?? 999)
  const pagamentos = candidatos.map((c) => c.prazo_pagamento_dias ?? 0)
  const fretes = candidatos.map((c) => c.frete_fixo ?? 0)

  const minPreco = Math.min(...precos)
  const maxPreco = Math.max(...precos)
  const maxEntrega = Math.max(...entregas)
  const maxPagamento = Math.max(...pagamentos)
  const maxFrete = Math.max(...fretes)

  const totalPeso = pesos.preco + pesos.entrega + pesos.pagamento + pesos.frete

  return candidatos.map((c) => {
    const precoNorm = c.preco_unitario / Math.max(c.quantidade_minima ?? 1, 1)
    const scorePreco = (1 - norm(precoNorm, minPreco, maxPreco)) * pesos.preco
    const scoreEntrega = (1 - norm(c.prazo_entrega_dias ?? maxEntrega, 0, maxEntrega)) * pesos.entrega
    const scorePagamento = norm(c.prazo_pagamento_dias ?? 0, 0, maxPagamento) * pesos.pagamento
    const scoreFrete = (1 - norm(c.frete_fixo ?? 0, 0, maxFrete)) * pesos.frete
    const score = (scorePreco + scoreEntrega + scorePagamento + scoreFrete) / totalPeso

    return { ...c, score }
  })
}

export function agruparPorInsumo(itens: CandidatoItem[]): GrupoInsumo[] {
  const mapa = new Map<string, GrupoInsumo>()

  for (const item of itens) {
    if (!mapa.has(item.insumo_id)) {
      mapa.set(item.insumo_id, { insumo_id: item.insumo_id, insumo_nome: item.insumo_nome, candidatos: [] })
    }
    mapa.get(item.insumo_id)!.candidatos.push(item)
  }

  // Ordena candidatos por score desc dentro de cada grupo
  for (const grupo of mapa.values()) {
    grupo.candidatos.sort((a, b) => b.score - a.score)
  }

  return Array.from(mapa.values()).sort((a, b) =>
    a.insumo_nome.localeCompare(b.insumo_nome, 'pt-BR')
  )
}
