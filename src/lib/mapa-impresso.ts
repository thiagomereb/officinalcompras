import type { CandidatoItem, GrupoInsumo } from './comparacao'
import { quantidadeEmBase } from './unidades'

// Monta o mapa impresso no formato do relatório do ERP ([461] MAPA DE
// COTAÇÃO): cada produto pedido numa linha e, embaixo, todos os fornecedores
// da cotação com o preço por unidade base de cada um (vazio se não cotou) e
// a marca no fornecedor escolhido para comprar.

export type PedidoMapa = {
  codigo: string | null
  nome: string
  quantidade: number | null
  unidade: string | null
  insumo_id: string
}

export type EscolhaImpressa = {
  cotacao_item_id: string
  quantidade: number | null
  quantidade_unidade: string | null
}

export type PrecoImpresso = {
  valor: number
  base: string | null
  // Outra grandeza que a do produto (ex.: "un" num produto em gramas)
  comparavel: boolean
  escolhido: boolean
}

export type LinhaImpressa = {
  codigo: string | null
  nome: string
  quantidade: number | null
  unidade: string | null
  // Quanto o comprador decidiu comprar, quando é diferente do pedido
  compra: { quantidade: number; unidade: string | null } | null
  precos: Record<string, PrecoImpresso>
}

export type MapaImpresso = { fornecedores: string[]; linhas: LinhaImpressa[] }

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })

// A oferta de cada fornecedor num produto: a escolhida, se for dele; senão a
// de menor preço comparável (ou a de menor preço, se nenhuma for comparável)
function substitui(c: CandidatoItem, atual: CandidatoItem, escolhido: string | undefined): boolean {
  if (atual.cotacao_item_id === escolhido) return false
  if (c.cotacao_item_id === escolhido) return true
  if (c.preco_comparavel !== atual.preco_comparavel) return c.preco_comparavel
  return c.preco_base < atual.preco_base
}

function precosDoGrupo(grupo: GrupoInsumo | undefined, escolhido: string | undefined): Record<string, PrecoImpresso> {
  const porFornecedor = new Map<string, CandidatoItem>()
  for (const c of grupo?.candidatos ?? []) {
    const atual = porFornecedor.get(c.fornecedor_nome)
    if (!atual || substitui(c, atual, escolhido)) porFornecedor.set(c.fornecedor_nome, c)
  }
  return Object.fromEntries(
    [...porFornecedor].map(([nome, c]) => [
      nome,
      { valor: c.preco_base, base: c.unidade_base, comparavel: c.preco_comparavel, escolhido: c.cotacao_item_id === escolhido },
    ]),
  )
}

function compraDiferente(
  quantidade: number | null,
  unidade: string | null,
  escolha: EscolhaImpressa | undefined,
): LinhaImpressa['compra'] {
  if (escolha?.quantidade == null) return null
  if (quantidade != null) {
    const pedido = quantidadeEmBase(quantidade, unidade)
    const compra = quantidadeEmBase(escolha.quantidade, escolha.quantidade_unidade)
    if (pedido.base === compra.base && Math.abs(pedido.valor - compra.valor) < 1e-9) return null
  }
  return { quantidade: escolha.quantidade, unidade: escolha.quantidade_unidade }
}

export function montarMapaImpresso({
  pedidos,
  grupos,
  escolhas,
  fornecedoresDosOrcamentos,
}: {
  pedidos: PedidoMapa[]
  grupos: GrupoInsumo[]
  escolhas: Map<string, EscolhaImpressa>
  fornecedoresDosOrcamentos: string[]
}): MapaImpresso {
  const grupoPorInsumo = new Map(grupos.map((g) => [g.insumo_id, g]))

  const linha = (p: PedidoMapa): LinhaImpressa => {
    const escolha = escolhas.get(p.insumo_id)
    return {
      codigo: p.codigo,
      nome: p.nome,
      quantidade: p.quantidade,
      unidade: p.unidade,
      compra: compraDiferente(p.quantidade, p.unidade, escolha),
      precos: precosDoGrupo(grupoPorInsumo.get(p.insumo_id), escolha?.cotacao_item_id),
    }
  }

  // Ofertas de produto que não está entre os pedidos (ou mapa sem cotação
  // própria) vão no fim, pelo nome do insumo
  const pedidosInsumos = new Set(pedidos.map((p) => p.insumo_id))
  const avulsos: PedidoMapa[] = grupos
    .filter((g) => !pedidosInsumos.has(g.insumo_id))
    .sort((a, b) => porNome(a.insumo_nome, b.insumo_nome))
    .map((g) => {
      const e = escolhas.get(g.insumo_id)
      return { codigo: null, nome: g.insumo_nome, quantidade: e?.quantidade ?? null, unidade: e?.quantidade_unidade ?? null, insumo_id: g.insumo_id }
    })

  const linhas = [...pedidos, ...avulsos].map(linha)
  const fornecedores = [
    ...new Set([...fornecedoresDosOrcamentos, ...grupos.flatMap((g) => g.candidatos.map((c) => c.fornecedor_nome))]),
  ].sort(porNome)

  return { fornecedores, linhas }
}
