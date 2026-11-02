import { precoPorUnidadeBase } from './unidades'

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
  // Preço convertido para a unidade base (R$/g, R$/mL, R$/un) — é o que entra no score
  preco_base: number
  unidade_base: string | null
  // false quando a unidade do item é de outra grandeza que a da maioria do
  // grupo (ex: "un" num grupo em gramas); o preço dele não entra na disputa
  preco_comparavel: boolean
  score: number
}

export type CandidatoSemScore = Omit<CandidatoItem, 'score' | 'preco_base' | 'unidade_base' | 'preco_comparavel'>

export type GrupoInsumo = {
  insumo_id: string
  insumo_nome: string
  candidatos: CandidatoItem[]
}

// Critério sem informação ou sem variação dentro do grupo não deve decidir a
// disputa, então vale o meio da escala para todos.
const NEUTRO = 0.5

// 1 = melhor valor do grupo, 0 = pior. Valores nulos ficam neutros e não
// participam do min/max — senão um prazo vazio distorce a escala dos demais.
function escala(valor: number | null, conhecidos: number[], menorEMelhor: boolean): number {
  if (valor == null || conhecidos.length === 0) return NEUTRO
  const min = Math.min(...conhecidos)
  const max = Math.max(...conhecidos)
  if (max === min) return NEUTRO
  const pos = (valor - min) / (max - min)
  return menorEMelhor ? 1 - pos : pos
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

function pontuarGrupo(candidatos: CandidatoSemScore[], pesos: Pesos): CandidatoItem[] {
  const precos = candidatos.map((c) => precoPorUnidadeBase(c.preco_unitario, c.quantidade_minima, c.unidade))
  const base = baseMaisComum(precos.map((p) => p.base))
  const comparavel = precos.map((p) => p.base === base)

  const precosComparaveis = precos.filter((_, i) => comparavel[i]).map((p) => p.valor)
  const entregas = candidatos.flatMap((c) => (c.prazo_entrega_dias != null ? [c.prazo_entrega_dias] : []))
  const pagamentos = candidatos.flatMap((c) => (c.prazo_pagamento_dias != null ? [c.prazo_pagamento_dias] : []))
  // Frete vazio é exibido como "Grátis" em toda a interface, então conta como 0
  const fretes = candidatos.map((c) => c.frete_fixo ?? 0)

  const totalPeso = pesos.preco + pesos.entrega + pesos.pagamento + pesos.frete

  return candidatos.map((c, i) => {
    const scorePreco = comparavel[i] ? escala(precos[i].valor, precosComparaveis, true) : NEUTRO
    const scoreEntrega = escala(c.prazo_entrega_dias, entregas, true)
    const scorePagamento = escala(c.prazo_pagamento_dias, pagamentos, false)
    const scoreFrete = escala(c.frete_fixo ?? 0, fretes, true)

    const score =
      (scorePreco * pesos.preco +
        scoreEntrega * pesos.entrega +
        scorePagamento * pesos.pagamento +
        scoreFrete * pesos.frete) /
      totalPeso

    return {
      ...c,
      preco_base: precos[i].valor,
      unidade_base: precos[i].base,
      preco_comparavel: comparavel[i],
      score,
    }
  })
}

// O score é sempre relativo aos concorrentes do MESMO insumo: normalizar o
// preço de um insumo de R$5/g contra outro de R$500/g achataria a diferença
// entre fornecedores e deixaria prazo/pagamento decidirem sozinhos.
export function calcularScores(candidatos: CandidatoSemScore[], pesos: Pesos): CandidatoItem[] {
  const totalPeso = pesos.preco + pesos.entrega + pesos.pagamento + pesos.frete
  const pesosValidos = Number.isFinite(totalPeso) && totalPeso > 0 ? pesos : PESOS_PADRAO

  const porInsumo = new Map<string, CandidatoSemScore[]>()
  for (const c of candidatos) {
    const grupo = porInsumo.get(c.insumo_id) ?? []
    grupo.push(c)
    porInsumo.set(c.insumo_id, grupo)
  }

  const pontuados = new Map<string, CandidatoItem>()
  for (const grupo of porInsumo.values()) {
    for (const c of pontuarGrupo(grupo, pesosValidos)) pontuados.set(c.cotacao_item_id, c)
  }

  // Mantém a ordem de entrada
  return candidatos.map((c) => pontuados.get(c.cotacao_item_id)!)
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

export function validarPesos(pesos: Pesos): string | null {
  const valores = [pesos.preco, pesos.entrega, pesos.pagamento, pesos.frete]
  if (valores.some((v) => !Number.isFinite(v) || v < 0)) return 'Os pesos devem ser números positivos.'
  if (valores.reduce((a, b) => a + b, 0) !== 100) return 'A soma dos pesos deve ser 100%.'
  return null
}
