import type { CandidatoItem, GrupoInsumo } from './comparacao'
import { quantidadeNaBase, type UnidadeQuantidade } from './unidades'

// O que o comprador decidiu para um insumo no mapa
export type Escolha = {
  insumo_id: string
  cotacao_item_id: string
  quantidade: number | null
  quantidade_unidade: UnidadeQuantidade | null
}

// A comparação como estava no momento da aprovação. O mapa aprovado e a
// impressão são desenhados a partir dela, não das cotações (que podem mudar).
// Versão 1 é da época dos pesos por critério: os grupos vêm ordenados pelo
// score de então (e trazem os pesos), que fica como estava.
export type ComparacaoCongelada = {
  versao: 1 | 2
  grupos: GrupoInsumo[]
}

export function ehComparacaoCongelada(v: unknown): v is ComparacaoCongelada {
  if (typeof v !== 'object' || v === null) return false
  const c = v as ComparacaoCongelada
  return (c.versao === 1 || c.versao === 2) && Array.isArray(c.grupos)
}

// Cópia da oferta escolhida, no formato que a função aprovar_mapa grava
export type ItemAprovado = {
  insumo_id: string
  cotacao_item_id: string
  quantidade: number
  quantidade_unidade: UnidadeQuantidade
  insumo_nome: string
  fornecedor_nome: string
  cotacao_id: string
  preco_unitario: number
  embalagem: number | null
  unidade: string | null
  preco_base: number
  unidade_base: string | null
  prazo_entrega_dias: number | null
  prazo_pagamento_dias: number | null
  frete_fixo: number | null
  validade: string | null
  sugerido: boolean | null
  valor_total: number | null
}

// A sugestão é a oferta de menor preço por unidade base, e só sugere: a escolha
// é sempre do comprador, que pesa o que o sistema não vê (prazo, frete, tamanho
// da embalagem, confiança no fornecedor...) e não precisa justificar quando
// foge dela. Sem ao menos duas ofertas comparáveis não há o que sugerir.
export function sugestaoDoGrupo(grupo: GrupoInsumo): CandidatoItem | null {
  const comparaveis = grupo.candidatos.filter((c) => c.preco_comparavel)
  return comparaveis.length > 1 ? comparaveis[0] : null
}

const centavos = (v: number) => Math.round(v * 100) / 100

// Grandezas em que dá para calcular valor a partir da quantidade comprada
const BASES_MEDIDAS = ['g', 'mL']

export type ValorEstimado =
  | { tipo: 'valor'; valor: number }
  | { tipo: 'sem_quantidade' }
  | { tipo: 'grandeza_diferente'; base: string }
  | { tipo: 'sem_conversao' }

// Valor estimado pelo preço por unidade base: 3 kg a R$ 0,085/g = R$ 255,00
export function valorEstimado(
  candidato: Pick<CandidatoItem, 'preco_base' | 'unidade_base'>,
  quantidade: number | null,
  unidade: UnidadeQuantidade | null,
): ValorEstimado {
  if (quantidade == null || !(quantidade > 0) || !unidade) return { tipo: 'sem_quantidade' }
  // Oferta vendida por unidade, cápsula etc.: não há como converter de g/mL
  if (!candidato.unidade_base || !BASES_MEDIDAS.includes(candidato.unidade_base)) return { tipo: 'sem_conversao' }
  const q = quantidadeNaBase(quantidade, unidade)
  if (q.base !== candidato.unidade_base) return { tipo: 'grandeza_diferente', base: candidato.unidade_base }
  return { tipo: 'valor', valor: centavos(q.valor * candidato.preco_base) }
}

export type ResultadoAprovacao =
  | { ok: true; itens: ItemAprovado[]; comparacao: ComparacaoCongelada; valorTotal: number }
  | { ok: false; erros: string[] }

// Confere as escolhas contra a comparação atual e monta a cópia que será
// congelada. Erros vêm todos de uma vez, para o comprador corrigir de uma vez.
export function montarAprovacao(grupos: GrupoInsumo[], escolhas: Escolha[]): ResultadoAprovacao {
  const erros: string[] = []
  if (escolhas.length === 0) {
    return { ok: false, erros: ['Escolha o fornecedor de pelo menos um insumo antes de aprovar.'] }
  }

  const porInsumo = new Map(grupos.map((g) => [g.insumo_id, g]))
  const vistos = new Set<string>()
  const itens: ItemAprovado[] = []

  for (const escolha of escolhas) {
    if (vistos.has(escolha.insumo_id)) continue
    vistos.add(escolha.insumo_id)

    const grupo = porInsumo.get(escolha.insumo_id)
    const candidato = grupo?.candidatos.find((c) => c.cotacao_item_id === escolha.cotacao_item_id)
    if (!grupo || !candidato) {
      erros.push('Uma das ofertas escolhidas não está mais neste mapa (a cotação mudou). Recarregue a página e confira.')
      continue
    }

    const valor = valorEstimado(candidato, escolha.quantidade, escolha.quantidade_unidade)
    if (valor.tipo === 'sem_quantidade') {
      erros.push(`${grupo.insumo_nome}: informe a quantidade a comprar.`)
      continue
    }
    if (valor.tipo === 'grandeza_diferente') {
      erros.push(
        `${grupo.insumo_nome}: a quantidade está em ${escolha.quantidade_unidade}, mas a oferta escolhida é vendida por ${valor.base}.`,
      )
      continue
    }

    const sugestao = sugestaoDoGrupo(grupo)
    itens.push({
      insumo_id: grupo.insumo_id,
      cotacao_item_id: candidato.cotacao_item_id,
      quantidade: escolha.quantidade!,
      quantidade_unidade: escolha.quantidade_unidade!,
      insumo_nome: grupo.insumo_nome,
      fornecedor_nome: candidato.fornecedor_nome,
      cotacao_id: candidato.cotacao_id,
      preco_unitario: candidato.preco_unitario,
      embalagem: candidato.quantidade_minima,
      unidade: candidato.unidade,
      preco_base: candidato.preco_base,
      unidade_base: candidato.unidade_base,
      prazo_entrega_dias: candidato.prazo_entrega_dias,
      prazo_pagamento_dias: candidato.prazo_pagamento_dias,
      frete_fixo: candidato.frete_fixo,
      validade: candidato.validade,
      sugerido: sugestao ? sugestao.cotacao_item_id === candidato.cotacao_item_id : null,
      valor_total: valor.tipo === 'valor' ? valor.valor : null,
    })
  }

  if (erros.length) return { ok: false, erros }

  const valorTotal = centavos(itens.reduce((soma, i) => soma + (i.valor_total ?? 0), 0))
  return { ok: true, itens, comparacao: { versao: 2, grupos }, valorTotal }
}
