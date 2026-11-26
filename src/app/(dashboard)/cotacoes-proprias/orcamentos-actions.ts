'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { removerArquivos } from '@/lib/supabase/storage'
import { buscarTodos, emLotes } from '@/lib/supabase/consultas'
import { carregarPedidosComSinonimos } from '@/lib/pedidos'
import { ehFornecedorDeCompra } from '@/lib/fornecedores'
import type { FornecedorCadastro } from '@/lib/reconhecer-fornecedor'
import type { ProdutoPedidoOpcao } from '@/lib/busca-pedidos'
import { chaveDescricao, itemParaGravar, itemValido, soDigitos } from '@/lib/orcamento'
import { ehUnidadeEmbalagem, normalizarUnidade } from '@/lib/unidades'
import { gravarPrecoNegociado } from '@/lib/negociacao'
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

// O que o modal de novo orçamento precisa, carregado só quando ele abre: os
// fornecedores de compra (para escolher e reconhecer) e os produtos pedidos com
// os sinônimos (para corrigir os vínculos)
export async function dadosParaNovoOrcamento(
  cotacaoPropriaId: string,
): Promise<{ fornecedores: FornecedorCadastro[]; pedidos: ProdutoPedidoOpcao[] } | Falha> {
  if (!UUID.test(cotacaoPropriaId)) return { erro: 'Cotação inválida.' }
  const supabase = await createClient()
  try {
    const [todos, pedidos] = await Promise.all([
      buscarTodos((de, ate) =>
        supabase
          .from('fornecedores')
          .select('id, razao_social, nome_fantasia, cnpj, codigo, credenciado, tipo')
          .eq('ativo', true)
          .order('razao_social')
          .order('id')
          .range(de, ate),
      ),
      carregarPedidosComSinonimos(supabase, cotacaoPropriaId),
    ])
    return {
      fornecedores: todos
        .filter((f) => ehFornecedorDeCompra(f.tipo))
        .map((f) => ({
          id: f.id,
          razao_social: f.razao_social,
          nome_fantasia: f.nome_fantasia,
          cnpj: f.cnpj,
          codigo: f.codigo,
          credenciado: f.credenciado,
        })),
      pedidos: pedidos.map(({ id, codigo, nome, sinonimos, quantidade, unidade }) => ({ id, codigo, nome, sinonimos, quantidade, unidade })),
    }
  } catch (e) {
    return { erro: (e as Error).message }
  }
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
  // conferido: o comprador escolheu o produto pedido na prévia; pedido_id: a
  // linha exata que ele escolheu (o mesmo código pode estar em mais de uma)
  const itens = p.itens.flatMap((raw) => {
    const item = itemValido(raw)
    const r = (raw ?? {}) as Record<string, unknown>
    const pedidoId = typeof r.pedido_id === 'string' && UUID.test(r.pedido_id) ? r.pedido_id : null
    return item ? [{ ...item, conferido: r.conferido === true, pedidoId }] : []
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

  // Código ou insumo em mais de uma linha da cotação: vale a primeira linha
  const pedidoPorId = new Map(pedidos.map((x) => [x.id, x]))
  const pedidoPorCodigo = new Map<string, (typeof pedidos)[number]>()
  const pedidoPorInsumo = new Map<string, (typeof pedidos)[number]>()
  for (const x of pedidos) {
    if (!pedidoPorCodigo.has(x.codigo)) pedidoPorCodigo.set(x.codigo, x)
    if (!pedidoPorInsumo.has(x.insumo_id)) pedidoPorInsumo.set(x.insumo_id, x)
  }

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
    const escolhido = i.conferido && i.pedidoId ? pedidoPorId.get(i.pedidoId) : undefined
    const pedido = escolhido ?? pedidoSinonimo ?? (i.codigo_pedido ? pedidoPorCodigo.get(i.codigo_pedido) : undefined)
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
    .select('descricao_original, insumo_id')
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

  // A escolha feita num mapa em rascunho foi sob o produto antigo: é desfeita
  if (item.insumo_id !== insumoId) {
    const desfeitas = await desfazerEscolhasEmRascunho(supabase, { itemId })
    if (desfeitas) return desfeitas
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

// Escolhas de mapa que apontam para um item (ou para os itens de um orçamento).
// Em rascunho são apagadas; em mapa aprovado ou cancelado o item é registro
// de compra e não pode sumir.
async function desfazerEscolhasEmRascunho(
  supabase: Supabase,
  alvo: { itemId: string } | { orcamentoId: string },
  bloquearAprovado = false,
): Promise<Falha | void> {
  const consulta = supabase.from('mapa_cotacao_itens').select('id, mapas_cotacao(status), cotacao_itens!inner(cotacao_id)')
  const { data: escolhas, error } =
    'itemId' in alvo
      ? await consulta.eq('cotacao_item_id', alvo.itemId)
      : await consulta.eq('cotacao_itens.cotacao_id', alvo.orcamentoId)
  if (error) return { erro: error.message }

  const status = (e: { mapas_cotacao: unknown }) => (e.mapas_cotacao as { status: string } | null)?.status
  if (bloquearAprovado && (escolhas ?? []).some((e) => status(e) !== 'rascunho')) {
    return { erro: 'Há itens deste orçamento comprados num mapa aprovado. Ele fica guardado como registro da compra.' }
  }
  const rascunho = (escolhas ?? []).filter((e) => status(e) === 'rascunho').map((e) => e.id)
  if (!rascunho.length) return
  const { error: erroExclusao } = await supabase.from('mapa_cotacao_itens').delete().in('id', rascunho)
  if (erroExclusao) return { erro: erroExclusao.message }
  revalidatePath('/mapas', 'layout')
}

// O comprador negociou com o fornecedor: o preço combinado da embalagem vale no
// mapa e na ordem de compra no lugar do preço do orçamento, que fica guardado.
// null volta ao preço do orçamento. Com o mapa da cotação aprovado, não muda mais.
export async function negociarPrecoOrcamento(
  itemId: string,
  orcamentoId: string,
  cotacaoPropriaId: string,
  preco: number | null,
): Promise<Falha | void> {
  if (![itemId, orcamentoId, cotacaoPropriaId].every((id) => UUID.test(id))) return { erro: 'Item inválido.' }
  const supabase = await createClient()

  const [{ data: item }, { data: orcamento }, { count: mapasFechados }] = await Promise.all([
    supabase.from('cotacao_itens').select('preco_unitario').eq('id', itemId).eq('cotacao_id', orcamentoId).maybeSingle(),
    supabase.from('cotacoes').select('id').eq('id', orcamentoId).eq('cotacao_propria_id', cotacaoPropriaId).maybeSingle(),
    supabase
      .from('mapas_cotacao')
      .select('id', { count: 'exact', head: true })
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .in('status', ['aprovado', 'exportado']),
  ])
  if (!item || !orcamento) return { erro: 'Item não encontrado neste orçamento.' }
  if (mapasFechados) return { erro: 'O mapa desta cotação já foi aprovado: o preço da compra não muda mais.' }

  const gravado = await gravarPrecoNegociado(supabase, itemId, item.preco_unitario, preco)
  if (gravado) return gravado

  revalidatePath(caminho(cotacaoPropriaId, orcamentoId))
  revalidatePath(caminho(cotacaoPropriaId))
  revalidatePath('/mapas', 'layout')
}

// Item que a leitura não trouxe, digitado pelo comprador a partir do orçamento
export async function incluirItemNoOrcamento(payload: unknown): Promise<Falha | { descricao: string; pedido: string | null }> {
  const p = (payload ?? {}) as Record<string, unknown>
  const orcamentoId = texto(p.orcamentoId, 36)
  const cotacaoPropriaId = texto(p.cotacaoPropriaId, 36)
  const pedidoId = p.pedidoId == null ? null : texto(p.pedidoId, 36)
  const descricao = texto(p.descricao, 500)
  const embalagem = Number(p.embalagem)
  const unidade = normalizarUnidade(typeof p.unidade === 'string' ? p.unidade : null)
  const embalagens = Number(p.embalagens)
  const preco = Number(p.preco)
  const validade = p.validade == null ? null : texto(p.validade, 10)
  const ipi = p.ipi == null ? null : Number(p.ipi)

  if (!orcamentoId || !UUID.test(orcamentoId) || !cotacaoPropriaId || !UUID.test(cotacaoPropriaId)) return { erro: 'Orçamento inválido.' }
  if (p.pedidoId != null && (!pedidoId || !UUID.test(pedidoId))) return { erro: 'Produto pedido inválido.' }
  if (!descricao) return { erro: 'Informe a descrição do item, como está no orçamento.' }
  if (!(Number.isFinite(embalagem) && embalagem > 0)) return { erro: 'Informe o tamanho da embalagem.' }
  if (!ehUnidadeEmbalagem(unidade)) return { erro: 'Unidade da embalagem inválida.' }
  if (!(Number.isFinite(embalagens) && embalagens > 0)) return { erro: 'Informe quantas embalagens foram cotadas.' }
  if (!(Number.isFinite(preco) && preco > 0)) return { erro: 'Informe o preço da embalagem.' }
  if (p.validade != null && (!validade || !/^\d{4}-\d{2}-\d{2}$/.test(validade))) return { erro: 'Validade inválida.' }
  if (ipi != null && !(Number.isFinite(ipi) && ipi >= 0 && ipi <= 100)) return { erro: 'O IPI vai de 0 a 100%.' }

  const supabase = await createClient()
  const [{ data: orcamento }, { data: pedido }] = await Promise.all([
    supabase.from('cotacoes').select('id').eq('id', orcamentoId).eq('cotacao_propria_id', cotacaoPropriaId).maybeSingle(),
    pedidoId
      ? supabase.from('cotacao_propria_itens').select('insumo_id, nome').eq('id', pedidoId).eq('cotacao_propria_id', cotacaoPropriaId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!orcamento) return { erro: 'Orçamento não encontrado nesta cotação.' }
  if (pedidoId && !pedido) return { erro: 'Produto pedido não encontrado nesta cotação.' }

  const { error } = await supabase.from('cotacao_itens').insert({
    cotacao_id: orcamentoId,
    descricao_original: descricao,
    preco_unitario: Math.round(preco * 10000) / 10000,
    quantidade_minima: embalagem,
    quantidade: embalagens,
    unidade,
    validade,
    ipi: ipi ?? 0,
    st: 0,
    cotacao_propria_item_id: pedidoId,
    insumo_id: pedido?.insumo_id ?? null,
    // O comprador decidiu o vínculo (ou que não foi pedido): nada a conferir
    vinculo_origem: 'comprador',
    vinculo_obs: null,
  })
  if (error) return { erro: error.message }

  if (pedido) await aprender(supabase, [{ descricao, insumo_id: pedido.insumo_id }])
  revalidatePath(caminho(cotacaoPropriaId, orcamentoId))
  revalidatePath(caminho(cotacaoPropriaId))
  revalidatePath('/mapas', 'layout')
  return { descricao, pedido: pedido?.nome ?? null }
}

// Desfaz uma inclusão à mão. Os itens que a leitura trouxe ficam: são o que o
// fornecedor mandou. A leitura grava todos de uma vez, no mesmo instante, então
// incluído à mão é o que tem outro horário.
export async function removerItemIncluido(itemId: string, orcamentoId: string, cotacaoPropriaId: string): Promise<Falha | void> {
  if (![itemId, orcamentoId, cotacaoPropriaId].every((id) => UUID.test(id))) return { erro: 'Item inválido.' }
  const supabase = await createClient()

  const [{ data: orcamento }, { data: item }, { data: primeiro }] = await Promise.all([
    supabase.from('cotacoes').select('id').eq('id', orcamentoId).eq('cotacao_propria_id', cotacaoPropriaId).maybeSingle(),
    supabase.from('cotacao_itens').select('created_at').eq('id', itemId).eq('cotacao_id', orcamentoId).maybeSingle(),
    supabase
      .from('cotacao_itens')
      .select('created_at')
      .eq('cotacao_id', orcamentoId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  if (!orcamento || !item) return { erro: 'Item não encontrado neste orçamento.' }
  if (!item.created_at || item.created_at === primeiro?.created_at) return { erro: 'Só sai do orçamento o item incluído à mão.' }

  // Escolhido num mapa aprovado é registro de compra; em rascunho, a escolha sai junto
  const desfeitas = await desfazerEscolhasEmRascunho(supabase, { itemId }, true)
  if (desfeitas) return desfeitas

  const { error } = await supabase.from('cotacao_itens').delete().eq('id', itemId)
  if (error) return { erro: error.message }
  revalidatePath(caminho(cotacaoPropriaId, orcamentoId))
  revalidatePath(caminho(cotacaoPropriaId))
}

export async function excluirOrcamento(orcamentoId: string, cotacaoPropriaId: string): Promise<Falha | void> {
  const supabase = await createClient()
  const desfeitas = await desfazerEscolhasEmRascunho(supabase, { orcamentoId }, true)
  if (desfeitas) return desfeitas

  const { data: orcamento } = await supabase.from('cotacoes').select('arquivo_url').eq('id', orcamentoId).single()
  const { error } = await supabase.from('cotacoes').delete().eq('id', orcamentoId)
  if (error) return { erro: error.message }
  await removerArquivos(supabase, [orcamento?.arquivo_url ?? null])
  revalidatePath(caminho(cotacaoPropriaId))
  revalidatePath('/mapas', 'layout')
}
