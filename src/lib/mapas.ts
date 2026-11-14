import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database'
import { compararOfertas, agruparPorInsumo, type OfertaCotacao, type GrupoInsumo } from './comparacao'
import { ehComparacaoCongelada } from './compras'
import { ehUnidadeQuantidade, type UnidadeQuantidade } from './unidades'
import { buscarTodos, emLotes } from './supabase/consultas'
import type { EscolhaImpressa, PedidoMapa } from './mapa-impresso'
import { montarOrdens, type EscolhaParaOrdem, type OrdemFornecedor, type ProdutoDaCotacao } from './ordem-compra'

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

// Nome de cada fornecedor dos orçamentos, como aparece nas ofertas do mapa
async function fornecedoresDosOrcamentos(supabase: SupabaseClient<Database>, orcamentos: string[]): Promise<string[]> {
  if (!orcamentos.length) return []
  const { data, error } = await supabase.from('cotacoes').select('fornecedores(razao_social, nome_fantasia)').in('id', orcamentos)
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => {
    const f = c.fornecedores as Fornecedor
    return f?.nome_fantasia ?? f?.razao_social ?? '—'
  })
}

export type DocumentoMapa = {
  mapa: Tables<'mapas_cotacao'>
  // Quantos orçamentos o mapa compara
  orcamentos: number
  // Cotação própria do mapa, os produtos pedidos nela (na ordem do ERP) e os
  // fornecedores dos orçamentos comparados
  cotacaoPropria: { numero: string } | null
  pedidos: PedidoMapa[]
  fornecedores: string[]
  grupos: GrupoInsumo[]
  // Escolha do comprador por insumo: é o asterisco do mapa impresso
  escolhas: Map<string, EscolhaImpressa>
}

// Tudo que o mapa impresso (PDF) precisa. Aprovado sai da cópia congelada,
// como a tela; rascunho usa os dados atuais.
export async function carregarDocumentoMapa(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<DocumentoMapa | null> {
  const { data: mapa } = await supabase.from('mapas_cotacao').select('*').eq('id', id).single()
  if (!mapa) return null

  const rascunho = mapa.status === 'rascunho'
  const congelada = ehComparacaoCongelada(mapa.comparacao) ? mapa.comparacao : null
  const orcamentos = await orcamentosDoMapa(supabase, mapa)

  const [grupos, { data: linhas }, { data: cotacaoPropria }, pedidos, fornecedores] = await Promise.all([
    congelada && !rascunho ? Promise.resolve(congelada.grupos) : carregarGruposMapa(supabase, orcamentos),
    supabase
      .from('mapa_cotacao_itens')
      .select('insumo_id, cotacao_item_id, quantidade, quantidade_unidade')
      .eq('mapa_id', id),
    mapa.cotacao_propria_id
      ? supabase.from('cotacoes_proprias').select('numero').eq('id', mapa.cotacao_propria_id).single()
      : Promise.resolve({ data: null }),
    mapa.cotacao_propria_id
      ? buscarTodos((de, ate) =>
          supabase
            .from('cotacao_propria_itens')
            .select('codigo, nome, quantidade, unidade, insumo_id')
            .eq('cotacao_propria_id', mapa.cotacao_propria_id!)
            .order('ordem')
            .range(de, ate),
        )
      : Promise.resolve([] as PedidoMapa[]),
    fornecedoresDosOrcamentos(supabase, orcamentos),
  ])

  const escolhas = new Map<string, EscolhaImpressa>()
  for (const l of linhas ?? []) {
    if (!l.cotacao_item_id) continue
    escolhas.set(l.insumo_id, {
      cotacao_item_id: l.cotacao_item_id,
      quantidade: l.quantidade,
      quantidade_unidade: ehUnidadeQuantidade(l.quantidade_unidade) ? l.quantidade_unidade : null,
    })
  }

  return { mapa, orcamentos: orcamentos.length, cotacaoPropria, pedidos, fornecedores, grupos, escolhas }
}

export type DocumentoOrdens = {
  mapa: { id: string; titulo: string; status: string }
  rascunho: boolean
  // Nº do pedido: o da cotação própria, como no ERP
  numero: string | null
  ordens: OrdemFornecedor[]
  empresa: Tables<'empresa'> | null
}

// Ordens de compra do mapa, uma por fornecedor. Aprovado usa a cópia gravada
// na aprovação; rascunho (ou aprovado sem a cópia) usa a oferta atual.
export async function carregarOrdensCompra(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<DocumentoOrdens | null> {
  const { data: mapa } = await supabase
    .from('mapas_cotacao')
    .select('id, titulo, status, cotacao_propria_id, cotacoes_ids')
    .eq('id', id)
    .single()
  if (!mapa) return null
  const rascunho = mapa.status === 'rascunho'

  const [{ data: escolhas, error }, { data: cotacao }, pedidos, { data: empresa }] = await Promise.all([
    supabase
      .from('mapa_cotacao_itens')
      .select(
        'insumo_id, cotacao_item_id, quantidade, quantidade_unidade, valor_total, insumo_nome, fornecedor_nome, preco_base, unidade_base, validade, prazo_entrega_dias, prazo_pagamento_dias',
      )
      .eq('mapa_id', id),
    mapa.cotacao_propria_id
      ? supabase.from('cotacoes_proprias').select('numero').eq('id', mapa.cotacao_propria_id).single()
      : Promise.resolve({ data: null }),
    mapa.cotacao_propria_id
      ? buscarTodos((de, ate) =>
          supabase
            .from('cotacao_propria_itens')
            .select('codigo, nome, teor, quantidade, unidade, insumo_id')
            .eq('cotacao_propria_id', mapa.cotacao_propria_id!)
            .order('ordem')
            .range(de, ate),
        )
      : Promise.resolve([] as ProdutoDaCotacao[]),
    // Sem a linha da empresa, a ordem sai sem o rodapé
    supabase.from('empresa').select('*').maybeSingle(),
  ])
  if (error) throw new Error(error.message)

  const congelada = (e: NonNullable<typeof escolhas>[number]) => !rascunho && e.fornecedor_nome != null && e.preco_base != null
  const precisaAtual = (escolhas ?? []).some((e) => !congelada(e))
  const candidatos = new Map(
    precisaAtual
      ? (await carregarGruposMapa(supabase, await orcamentosDoMapa(supabase, mapa))).flatMap((g) =>
          g.candidatos.map((c) => [c.cotacao_item_id, c] as const),
        )
      : [],
  )

  const lista: EscolhaParaOrdem[] = []
  for (const e of escolhas ?? []) {
    if (congelada(e)) {
      lista.push({
        insumo_id: e.insumo_id,
        insumo_nome: e.insumo_nome ?? '—',
        fornecedor: e.fornecedor_nome!,
        preco_base: e.preco_base,
        unidade_base: e.unidade_base,
        validade: e.validade,
        quantidade: e.quantidade,
        quantidade_unidade: e.quantidade_unidade,
        valor_total: e.valor_total,
        prazo_entrega_dias: e.prazo_entrega_dias,
        prazo_pagamento_dias: e.prazo_pagamento_dias,
      })
      continue
    }
    // A oferta escolhida pode ter saído (orçamento excluído): fica de fora
    const c = e.cotacao_item_id ? candidatos.get(e.cotacao_item_id) : undefined
    if (!c) continue
    lista.push({
      insumo_id: e.insumo_id,
      insumo_nome: c.insumo_nome,
      fornecedor: c.fornecedor_nome,
      preco_base: c.preco_base,
      unidade_base: c.unidade_base,
      validade: c.validade,
      quantidade: e.quantidade,
      quantidade_unidade: e.quantidade_unidade,
      valor_total: null,
      prazo_entrega_dias: c.prazo_entrega_dias,
      prazo_pagamento_dias: c.prazo_pagamento_dias,
    })
  }

  return {
    mapa: { id: mapa.id, titulo: mapa.titulo, status: mapa.status },
    rascunho,
    numero: cotacao?.numero ?? null,
    ordens: montarOrdens(lista, pedidos),
    empresa: empresa ?? null,
  }
}
