import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { calcularScores, agruparPorInsumo, type CandidatoSemScore, type GrupoInsumo, type Pesos } from './comparacao'
import { buscarTodos, emLotes } from './supabase/consultas'

type Fornecedor = { razao_social: string; nome_fantasia: string | null } | null

// Monta os grupos de comparação de um mapa: cada item vinculado das cotações
// do mapa vira um candidato, pontuado contra os outros do mesmo insumo.
// Usado pela tela do mapa e pela versão de impressão, que precisam mostrar
// exatamente o mesmo ranking.
export async function carregarGruposMapa(
  supabase: SupabaseClient<Database>,
  cotacoesIds: string[],
  pesos: Pesos,
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

  const candidatos: CandidatoSemScore[] = itens
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

  return agruparPorInsumo(calcularScores(candidatos, pesos))
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
