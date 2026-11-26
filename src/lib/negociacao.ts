import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Falha } from './acoes'

// Grava o preço da embalagem que o comprador combinou com o fornecedor, ao
// lado do preço do orçamento (que fica guardado). null, ou o mesmo preço do
// orçamento, volta ao do orçamento. Usado pelo mapa e pela página do orçamento.
export async function gravarPrecoNegociado(
  supabase: SupabaseClient<Database>,
  cotacaoItemId: string,
  precoOrcamento: number,
  preco: number | null,
): Promise<Falha | void> {
  if (preco != null && !(Number.isFinite(preco) && preco > 0 && preco < 1e9)) return { erro: 'Informe um preço maior que zero.' }
  const igual = preco != null && Math.round(preco * 10000) === Math.round(precoOrcamento * 10000)
  const negociado = preco == null || igual ? null : Math.round(preco * 10000) / 10000

  const { data: claims } = await supabase.auth.getClaims()
  const { error } = await supabase
    .from('cotacao_itens')
    .update({
      preco_negociado: negociado,
      negociado_em: negociado != null ? new Date().toISOString() : null,
      negociado_por: negociado != null ? ((claims?.claims?.email as string | undefined) ?? null) : null,
    })
    .eq('id', cotacaoItemId)
  if (error) return { erro: error.message }
}
