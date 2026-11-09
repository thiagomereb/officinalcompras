'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { removerArquivos } from '@/lib/supabase/storage'
import { emLotes } from '@/lib/supabase/consultas'
import { chaveDescricao, itemParaGravar, itemValido, soDigitos } from '@/lib/orcamento'
import type { Falha } from '@/lib/acoes'
import type { Json } from '@/types/database'

type Supabase = Awaited<ReturnType<typeof createClient>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Formato dos paths gerados por enviarArquivoCotacao (lib/supabase/upload.ts)
const PATH_ARQUIVO = /^\d+-[a-z0-9]+\.(jpe?g|png|webp|pdf|xlsx|xls)$/
const LIMITE_ITENS = 1500

const caminho = (cotacaoPropriaId: string, orcamentoId?: string) =>
  orcamentoId ? `/cotacoes-proprias/${cotacaoPropriaId}/orcamentos/${orcamentoId}` : `/cotacoes-proprias/${cotacaoPropriaId}`

function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

function numeroPositivo(v: unknown): number | null {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

function hojeBrasilia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// O comprador confirmou que estas descrições são estes insumos: viram sinônimos
// para a próxima leitura já vir certa (função aprender_sinonimos)
async function aprender(supabase: Supabase, pares: { descricao: string; insumo_id: string }[]) {
  if (!pares.length) return
  const { error } = await supabase.rpc('aprender_sinonimos', { p_pares: pares as unknown as Json })
  if (error) console.warn(`[orcamentos] não foi possível guardar sinônimos: ${error.message}`)
  else revalidatePath('/insumos', 'layout')
}

export async function salvarOrcamento(payload: unknown): Promise<{ id: string } | Falha> {
  const p = (payload ?? {}) as Record<string, unknown>
  const cotacaoPropriaId = texto(p.cotacaoPropriaId, 36)
  const fornecedorId = texto(p.fornecedorId, 36)
  const arquivoUrl = texto(p.arquivoUrl, 100)
  if (!cotacaoPropriaId || !UUID.test(cotacaoPropriaId)) return { erro: 'Cotação inválida.' }
  if (!fornecedorId || !UUID.test(fornecedorId)) return { erro: 'Escolha o fornecedor do orçamento.' }
  if (!arquivoUrl || !PATH_ARQUIVO.test(arquivoUrl)) return { erro: 'Arquivo do orçamento inválido.' }

  if (!Array.isArray(p.itens) || p.itens.length === 0) return { erro: 'Nenhum item lido no orçamento.' }
  if (p.itens.length > LIMITE_ITENS) return { erro: `O orçamento passa de ${LIMITE_ITENS} itens.` }
  // conferido: o comprador escolheu o produto pedido na prévia
  const itens = p.itens.flatMap((raw) => {
    const item = itemValido(raw)
    return item ? [{ ...item, conferido: (raw as Record<string, unknown>)?.conferido === true }] : []
  })
  if (itens.length === 0) return { erro: 'Nenhum item com preço válido no orçamento.' }

  const c = (p.cabecalho ?? {}) as Record<string, unknown>
  const data = texto(c.data, 10)
  const frete = texto(c.frete, 3)

  const supabase = await createClient()
  const { data: pedidos, error: erroPedidos } = await supabase
    .from('cotacao_propria_itens')
    .select('id, codigo, insumo_id')
    .eq('cotacao_propria_id', cotacaoPropriaId)
    .order('ordem')
  if (erroPedidos) return { erro: erroPedidos.message }
  if (!pedidos?.length) return { erro: 'Cotação própria não encontrada.' }

  const pedidoPorCodigo = new Map(pedidos.map((x) => [x.codigo, x]))
  const pedidoPorInsumo = new Map<string, (typeof pedidos)[number]>()
  for (const x of pedidos) if (!pedidoPorInsumo.has(x.insumo_id)) pedidoPorInsumo.set(x.insumo_id, x)

  // Descrição que o comprador já confirmou antes vale mais que a leitura da IA
  const sinonimos = await emLotes([...pedidoPorInsumo.keys()], (lote) =>
    supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', lote),
  )
  const insumoPorDescricao = new Map(sinonimos.map((s) => [chaveDescricao(s.sinonimo), s.insumo_id]))

  const { data: orcamento, error } = await supabase
    .from('cotacoes')
    .insert({
      cotacao_propria_id: cotacaoPropriaId,
      fornecedor_id: fornecedorId,
      data_cotacao: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeBrasilia(),
      numero_orcamento: texto(c.numero, 60),
      validade_texto: texto(c.validade_proposta, 120),
      pedido_minimo: numeroPositivo(c.pedido_minimo),
      frete_tipo: frete === 'CIF' || frete === 'FOB' ? frete : null,
      total_documento: numeroPositivo(c.total_documento),
      arquivo_url: arquivoUrl,
      arquivo_nome: texto(p.arquivoNome, 255),
      status: 'processado',
    })
    .select('id')
    .single()
  if (error || !orcamento) return { erro: error?.message ?? 'Não foi possível gravar o orçamento.' }

  // Quem decide o vínculo, nesta ordem: o comprador na prévia; uma descrição
  // que ele já confirmou antes (sinônimo); a sugestão da leitura
  const linhas = itens.map((i) => {
    const porSinonimo = i.conferido ? undefined : insumoPorDescricao.get(chaveDescricao(i.descricao))
    const pedidoSinonimo = porSinonimo ? pedidoPorInsumo.get(porSinonimo) : undefined
    const pedido = pedidoSinonimo ?? (i.codigo_pedido ? pedidoPorCodigo.get(i.codigo_pedido) : undefined)
    const origem = i.conferido ? 'comprador' : pedidoSinonimo ? 'sinonimo' : 'ia'
    return {
      cotacao_id: orcamento.id,
      descricao_original: i.descricao,
      ...itemParaGravar(i),
      validade: i.validade,
      pais_origem: i.pais_origem,
      ipi: i.ipi ?? 0,
      st: i.st ?? 0,
      cotacao_propria_item_id: pedido?.id ?? null,
      insumo_id: pedido?.insumo_id ?? null,
      vinculo_origem: origem,
      vinculo_obs: origem === 'ia' ? i.obs : null,
    }
  })

  const { error: erroItens } = await supabase.from('cotacao_itens').insert(linhas)
  if (erroItens) {
    await supabase.from('cotacoes').delete().eq('id', orcamento.id)
    return { erro: erroItens.message }
  }

  // O que o comprador ligou na prévia vira sinônimo, como no orçamento salvo
  await aprender(
    supabase,
    linhas.flatMap((l) => (l.vinculo_origem === 'comprador' && l.insumo_id ? [{ descricao: l.descricao_original, insumo_id: l.insumo_id }] : [])),
  )

  // Fornecedor escolhido à mão e sem CNPJ no cadastro guarda o do orçamento,
  // para ser reconhecido sozinho no próximo
  const cnpj = soDigitos(texto(c.cnpj, 30))
  if (cnpj.length === 14) {
    const formatado = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    await supabase.from('fornecedores').update({ cnpj: formatado }).eq('id', fornecedorId).is('cnpj', null)
    revalidatePath('/fornecedores')
  }

  revalidatePath(caminho(cotacaoPropriaId))
  return { id: orcamento.id }
}

// O comprador escolhe o produto pedido de um item (ou diz que não foi pedido)
export async function alterarVinculoOrcamento(
  itemId: string,
  pedidoItemId: string | null,
  orcamentoId: string,
  cotacaoPropriaId: string,
): Promise<Falha | void> {
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('cotacao_itens')
    .select('descricao_original')
    .eq('id', itemId)
    .eq('cotacao_id', orcamentoId)
    .single()
  if (!item) return { erro: 'Item não encontrado.' }

  let insumoId: string | null = null
  if (pedidoItemId) {
    const { data: pedido } = await supabase
      .from('cotacao_propria_itens')
      .select('insumo_id')
      .eq('id', pedidoItemId)
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .single()
    if (!pedido) return { erro: 'Produto pedido não encontrado nesta cotação.' }
    insumoId = pedido.insumo_id
  }

  const { error } = await supabase
    .from('cotacao_itens')
    .update({ cotacao_propria_item_id: pedidoItemId, insumo_id: insumoId, vinculo_origem: 'comprador', vinculo_obs: null })
    .eq('id', itemId)
  if (error) return { erro: error.message }

  if (insumoId) await aprender(supabase, [{ descricao: item.descricao_original, insumo_id: insumoId }])
  revalidatePath(caminho(cotacaoPropriaId, orcamentoId))
  revalidatePath(caminho(cotacaoPropriaId))
}

// Aceita de uma vez as sugestões da leitura que o comprador revisou
export async function confirmarSugestoes(orcamentoId: string, cotacaoPropriaId: string): Promise<{ confirmados: number } | Falha> {
  const supabase = await createClient()
  const { data: sugeridos, error } = await supabase
    .from('cotacao_itens')
    .select('id, descricao_original, insumo_id')
    .eq('cotacao_id', orcamentoId)
    .eq('vinculo_origem', 'ia')
  if (error) return { erro: error.message }
  if (!sugeridos?.length) return { confirmados: 0 }

  const { error: erroUpdate } = await supabase
    .from('cotacao_itens')
    .update({ vinculo_origem: 'comprador' })
    .in('id', sugeridos.map((s) => s.id))
  if (erroUpdate) return { erro: erroUpdate.message }

  await aprender(
    supabase,
    sugeridos.flatMap((s) => (s.insumo_id ? [{ descricao: s.descricao_original, insumo_id: s.insumo_id }] : [])),
  )
  revalidatePath(caminho(cotacaoPropriaId, orcamentoId))
  revalidatePath(caminho(cotacaoPropriaId))
  return { confirmados: sugeridos.length }
}

export async function excluirOrcamento(orcamentoId: string, cotacaoPropriaId: string): Promise<Falha | void> {
  const supabase = await createClient()
  const { data: orcamento } = await supabase.from('cotacoes').select('arquivo_url').eq('id', orcamentoId).single()
  const { error } = await supabase.from('cotacoes').delete().eq('id', orcamentoId)
  if (error) return { erro: error.message }
  await removerArquivos(supabase, [orcamento?.arquivo_url ?? null])
  revalidatePath(caminho(cotacaoPropriaId))
}
