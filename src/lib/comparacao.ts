import { precoPorUnidadeBase } from './unidades'

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
  // Preço convertido para a unidade base (R$/g, R$/mL, R$/un)
  preco_base: number
  unidade_base: string | null
  // false quando a unidade do item é de outra grandeza que a da maioria do
  // grupo (ex: "un" num grupo em gramas): o preço não dá para comparar
  preco_comparavel: boolean
}

// A oferta como vem das cotações, antes de converter o preço
export type OfertaCotacao = Omit<CandidatoItem, 'preco_base' | 'unidade_base' | 'preco_comparavel'>

export type GrupoInsumo = {
  insumo_id: string
  insumo_nome: string
  candidatos: CandidatoItem[]
}

function baseMaisComum(bases: (string | null)[]): string | null {
  const contagem = new Map<string | null, number>()
  for (const b of bases) contagem.set(b, (contagem.get(b) ?? 0) + 1)
  let melhor: string | null = null
  let maior = -1
  for (const [b, n] of contagem) {
    if (n > maior) {
      melhor = b
      maior = n
    }
  }
  return melhor
}

// Converte o preço de cada oferta para a unidade base e marca, dentro de cada
// insumo, quais podem ser comparadas entre si (mesma grandeza da maioria)
export function compararOfertas(ofertas: OfertaCotacao[]): CandidatoItem[] {
  const porInsumo = new Map<string, OfertaCotacao[]>()
  for (const o of ofertas) {
    const grupo = porInsumo.get(o.insumo_id) ?? []
    grupo.push(o)
    porInsumo.set(o.insumo_id, grupo)
  }

  const convertidas = new Map<string, CandidatoItem>()
  for (const grupo of porInsumo.values()) {
    const precos = grupo.map((o) => precoPorUnidadeBase(o.preco_unitario, o.quantidade_minima, o.unidade))
    const base = baseMaisComum(precos.map((p) => p.base))
    grupo.forEach((o, i) => {
      convertidas.set(o.cotacao_item_id, {
        ...o,
        preco_base: precos[i].valor,
        unidade_base: precos[i].base,
        preco_comparavel: precos[i].base === base,
      })
    })
  }

  // Mantém a ordem de entrada
  return ofertas.map((o) => convertidas.get(o.cotacao_item_id)!)
}

// Dentro de cada insumo, do menor preço por unidade base para o maior; o que
// não dá para comparar vai para o fim
export function agruparPorInsumo(itens: CandidatoItem[]): GrupoInsumo[] {
  const mapa = new Map<string, GrupoInsumo>()

  for (const item of itens) {
    if (!mapa.has(item.insumo_id)) {
      mapa.set(item.insumo_id, { insumo_id: item.insumo_id, insumo_nome: item.insumo_nome, candidatos: [] })
    }
    mapa.get(item.insumo_id)!.candidatos.push(item)
  }

  for (const grupo of mapa.values()) {
    grupo.candidatos.sort(
      (a, b) => Number(b.preco_comparavel) - Number(a.preco_comparavel) || a.preco_base - b.preco_base,
    )
  }

  return Array.from(mapa.values()).sort((a, b) =>
    a.insumo_nome.localeCompare(b.insumo_nome, 'pt-BR')
  )
}
