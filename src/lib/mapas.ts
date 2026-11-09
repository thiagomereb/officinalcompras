import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'
import { compararOfertas, agruparPorInsumo, type OfertaCotacao, type GrupoInsumo } from './comparacao'
import { ehComparacaoCongelada, valorEstimado } from './compras'
import { ehUnidadeQuantidade, type UnidadeQuantidade } from './unidades'
import { buscarTodos, emLotes } from './supabase/consultas'

type Fornecedor = { razao_social: string; nome_fantasia: string | null } | null

type MapaBase = { cotacao_propria_id: string | null; cotacoes_ids: string[]; status: string }

// Orçamentos que o mapa compara. Mapa de cotação própria em rascunho lê os
// orçamentos dela na hora (entra o que chegou depois de criado); aprovado ou
// cancelado usa a lista gravada.
export async function orcamentosDoMapa(supabase: SupabaseClient<Database>, mapa: MapaBase): Promise<string[]> {
  if (!mapa.cotacao_propria_id || mapa.status !== 'rascunho') return mapa.cotacoes_ids
  const { data, error } = await supabase
    .from('cotacoes')
    .select('id')
    .eq('cotacao_propria_id', mapa.cotacao_propria_id)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => c.id)
}

export type QuantidadePedida = { quantidade: number; unidade: UnidadeQuantidade }

// Quanto a cotação própria pediu de cada insumo, para começar a quantidade de
// compra do mapa (o comprador ajusta)
export async function quantidadesPedidas(
  supabase: SupabaseClient<Database>,
  cotacaoPropriaId: string | null,
): Promise<Record<string, QuantidadePedida>> {
  if (!cotacaoPropriaId) return {}
  const pedidos = await buscarTodos((de, ate) =>
    supabase
      .from('cotacao_propria_itens')
      .select('insumo_id, quantidade, unidade')
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .order('ordem')
      .range(de, ate),
  )
  const r: Record<string, QuantidadePedida> = {}
  for (const p of pedidos) {
    if (!r[p.insumo_id] && ehUnidadeQuantidade(p.unidade) && p.quantidade > 0) {
      r[p.insumo_id] = { quantidade: p.quantidade, unidade: p.unidade }
    }
  }
  return r
}

// Monta os grupos de comparação de um mapa: cada item vinculado das cotações
// do mapa vira uma oferta, comparada pelo preço na unidade base com as outras
// do mesmo insumo. Usado pela tela do mapa, pela aprovação e pelo PDF, que
// precisam mostrar exatamente a mesma ordem.
export async function carregarGruposMapa(
  supabase: SupabaseClient<Database>,
  cotacoesIds: string[],
): Promise<GrupoInsumo[]> {
  if (cotacoesIds.length === 0) return []

  const [{ data: cotacoes, error }, itens] = await Promise.all([
    supabase
      .from('cotacoes')
      .select('id, prazo_entrega_dias, prazo_pagamento_dias, frete_fixo, frete_gratis_acima, pedido_minimo, fornecedores(razao_social, nome_fantasia)')
      .in('id', cotacoesIds),
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_itens')
        .select('id, cotacao_id, insumo_id, preco_unitario, unidade, quantidade_minima, lote, validade, insumos(nome_padrao)')
        .in('cotacao_id', cotacoesIds)
        .not('insumo_id', 'is', null)
        .order('id')
        .range(de, ate),
    ),
  ])
  if (error) throw new Error(error.message)

  const condicoesPorCotacao = new Map(
    (cotacoes ?? []).map((c) => {
      const f = c.fornecedores as Fornecedor
      return [c.id, { ...c, fornecedor_nome: f?.nome_fantasia ?? f?.razao_social ?? '—' }]
    }),
  )

  const ofertas: OfertaCotacao[] = itens
    .filter((item) => item.insumo_id)
    .map((item) => {
      const cond = condicoesPorCotacao.get(item.cotacao_id)
      const insumo = item.insumos as { nome_padrao: string } | null
      return {
        cotacao_item_id: item.id,
        cotacao_id: item.cotacao_id,
        insumo_id: item.insumo_id!,
        insumo_nome: insumo?.nome_padrao ?? 'Desconhecido',
        fornecedor_nome: cond?.fornecedor_nome ?? '—',
        preco_unitario: item.preco_unitario,
        unidade: item.unidade,
        quantidade_minima: item.quantidade_minima,
        lote: item.lote,
        validade: item.validade,
        prazo_entrega_dias: cond?.prazo_entrega_dias ?? null,
        prazo_pagamento_dias: cond?.prazo_pagamento_dias ?? null,
        frete_fixo: cond?.frete_fixo ?? null,
        frete_gratis_acima: cond?.frete_gratis_acima ?? null,
        pedido_minimo: cond?.pedido_minimo ?? null,
      }
    })

  return agruparPorInsumo(compararOfertas(ofertas))
}

export type UltimaCompra = {
  mapa_id: string
  fornecedor_nome: string
  preco_base: number
  unidade_base: string | null
  aprovado_em: string
}

// Referência para negociar: a compra aprovada mais recente de cada insumo
export async function carregarUltimasCompras(
  supabase: SupabaseClient<Database>,
  insumoIds: string[],
): Promise<Record<string, UltimaCompra>> {
  const linhas = await emLotes(insumoIds, (lote) =>
    supabase
      .from('historico_compras')
      .select('insumo_id, mapa_id, fornecedor_nome, preco_base, unidade_base, aprovado_em')
      .in('insumo_id', lote)
      .order('aprovado_em', { ascending: false })
      .limit(1000),
  )

  const ultimas: Record<string, UltimaCompra> = {}
  for (const l of linhas) {
    if (!l.insumo_id || !l.mapa_id || l.preco_base == null || !l.aprovado_em) continue
    const atual = ultimas[l.insumo_id]
    if (atual && atual.aprovado_em >= l.aprovado_em) continue
    ultimas[l.insumo_id] = {
      mapa_id: l.mapa_id,
      fornecedor_nome: l.fornecedor_nome ?? '—',
      preco_base: l.preco_base,
      unidade_base: l.unidade_base,
      aprovado_em: l.aprovado_em,
    }
  }
  return ultimas
}

export type EscolhaDocumento = {
  cotacao_item_id: string
  quantidade: number | null
  quantidade_unidade: UnidadeQuantidade | null
  valor: number | null
}

export type DocumentoMapa = {
  mapa: Tables<'mapas_cotacao'>
  rascunho: boolean
  // Quantos orçamentos o mapa compara
  orcamentos: number
  grupos: GrupoInsumo[]
  escolhas: Map<string, EscolhaDocumento>
  // Rascunho: soma estimada na hora; aprovado: o valor gravado na aprovação
  total: number | null
}

// Tudo que o documento do mapa (PDF) precisa. Aprovado sai da cópia
// congelada, como a tela; rascunho é calculado com os dados atuais.
export async function carregarDocumentoMapa(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<DocumentoMapa | null> {
  const { data: mapa } = await supabase.from('mapas_cotacao').select('*').eq('id', id).single()
  if (!mapa) return null

  const rascunho = mapa.status === 'rascunho'
  const congelada = ehComparacaoCongelada(mapa.comparacao) ? mapa.comparacao : null
  const orcamentos = await orcamentosDoMapa(supabase, mapa)

  const [grupos, { data: linhas }] = await Promise.all([
    congelada && !rascunho ? Promise.resolve(congelada.grupos) : carregarGruposMapa(supabase, orcamentos),
    supabase
      .from('mapa_cotacao_itens')
      .select('insumo_id, cotacao_item_id, quantidade, quantidade_unidade, valor_total')
      .eq('mapa_id', id),
  ])

  const candidatoPorItem = new Map(grupos.flatMap((g) => g.candidatos.map((c) => [c.cotacao_item_id, c] as const)))
  const escolhas = new Map<string, EscolhaDocumento>()
  for (const l of linhas ?? []) {
    if (!l.cotacao_item_id) continue
    const unidade = ehUnidadeQuantidade(l.quantidade_unidade) ? l.quantidade_unidade : null
    let valor = l.valor_total
    if (rascunho) {
      const candidato = candidatoPorItem.get(l.cotacao_item_id)
      const estimado = candidato ? valorEstimado(candidato, l.quantidade, unidade) : null
      valor = estimado?.tipo === 'valor' ? estimado.valor : null
    }
    escolhas.set(l.insumo_id, { cotacao_item_id: l.cotacao_item_id, quantidade: l.quantidade, quantidade_unidade: unidade, valor })
  }

  const total = rascunho
    ? [...escolhas.values()].reduce((soma, e) => soma + (e.valor ?? 0), 0)
    : mapa.valor_total

  return { mapa, rascunho, orcamentos: orcamentos.length, grupos, escolhas, total }
}
