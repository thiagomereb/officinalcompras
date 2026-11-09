import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buscarTodos, emLotes } from './supabase/consultas'

export type PedidoComSinonimos = { id: string; codigo: string; nome: string; insumo_id: string; sinonimos: string[] }

// Os produtos pedidos de uma cotação própria, cada um com os sinônimos do
// insumo dele (para achar "ACIDO ASCORBICO" buscando "vitamina c")
export async function carregarPedidosComSinonimos(
  supabase: SupabaseClient<Database>,
  cotacaoPropriaId: string,
): Promise<PedidoComSinonimos[]> {
  const pedidos = await buscarTodos((de, ate) =>
    supabase
      .from('cotacao_propria_itens')
      .select('id, codigo, nome, insumo_id')
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .order('ordem')
      .range(de, ate),
  )
  const sinonimos = await emLotes([...new Set(pedidos.map((p) => p.insumo_id))], (lote) =>
    supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', lote),
  )
  const porInsumo = new Map<string, string[]>()
  for (const s of sinonimos) porInsumo.set(s.insumo_id, [...(porInsumo.get(s.insumo_id) ?? []), s.sinonimo])
  return pedidos.map((p) => ({ ...p, sinonimos: porInsumo.get(p.insumo_id) ?? [] }))
}
