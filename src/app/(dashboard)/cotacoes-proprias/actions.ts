'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { removerArquivos } from '@/lib/supabase/storage'
import { buscarTodos } from '@/lib/supabase/consultas'
import { mensagemErroBanco, type Falha } from '@/lib/acoes'
import { incluidoAMao } from '@/lib/pedidos'
import { chaveDescricao } from '@/lib/orcamento'
import { ehUnidadeQuantidade, normalizarUnidade } from '@/lib/unidades'
import type { ItemCotacaoPropria } from '@/lib/cotacao-propria'
import type { Json } from '@/types/database'

type Supabase = Awaited<ReturnType<typeof createClient>>

// Formato dos paths gerados por enviarArquivoCotacao (lib/supabase/upload.ts)
const PATH_PDF = /^\d+-[a-z0-9]+\.pdf$/
const LIMITE_ITENS = 3000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAPA_FECHADO = 'Esta cotação já tem mapa aprovado, que fica guardado como registro da compra: os produtos dela não mudam mais.'

// A leitura do PDF acontece no navegador (lib/cotacao-propria.ts); o que chega
// aqui é conferido campo a campo em vez de confiar no tipo
function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null
}

function itensValidos(itens: unknown): ItemCotacaoPropria[] | Falha {
  if (!Array.isArray(itens) || itens.length === 0) return { erro: 'Nenhum produto na cotação.' }
  if (itens.length > LIMITE_ITENS) return { erro: `A cotação passa de ${LIMITE_ITENS} produtos.` }

  // O mesmo código pode vir em mais de uma linha: cada linha é um item, como no relatório
  const validos: ItemCotacaoPropria[] = []
  for (const raw of itens) {
    const i = (raw ?? {}) as Record<string, unknown>
    const codigo = texto(i.codigo, 15)
    const nome = texto(i.nome, 300)
    const unidade = texto(i.unidade, 10)
    const ean = i.ean == null ? null : texto(i.ean, 14)
    const teor = i.teor == null ? null : Number(i.teor)
    const quantidade = Number(i.quantidade)

    if (!codigo || !/^\d+$/.test(codigo) || !nome || !unidade) return { erro: 'Produto inválido na cotação.' }
    // O relatório traz EAN com letras em alguns produtos ("G60CS000354I")
    if (i.ean != null && (!ean || !/^[0-9A-Z]+$/i.test(ean))) return { erro: `EAN inválido no produto ${codigo}.` }
    if (teor != null && !(teor >= 0 && teor <= 100)) return { erro: `Teor inválido no produto ${codigo}.` }
    if (!Number.isFinite(quantidade) || quantidade < 0) return { erro: `Quantidade inválida no produto ${codigo}.` }

    validos.push({ codigo, ean, nome, teor, quantidade, unidade })
  }
  return validos
}

// Devolve o id em vez de redirecionar: no navegador, o redirect de uma action
// chega como exceção, e o catch da importação apagava o PDF recém-enviado
export async function importarCotacaoPropria(payload: unknown): Promise<Falha | { id: string }> {
  const p = (payload ?? {}) as Record<string, unknown>
  const numero = texto(p.numero, 20)
  const arquivoUrl = texto(p.arquivoUrl, 100)
  const arquivoNome = texto(p.arquivoNome, 255)
  const emitidaEm = p.emitidaEm == null ? null : texto(p.emitidaEm, 40)

  if (!numero || !/^\d+$/.test(numero)) return { erro: 'Número da cotação inválido.' }
  if (!arquivoUrl || !PATH_PDF.test(arquivoUrl)) return { erro: 'Arquivo da cotação inválido.' }
  if (p.emitidaEm != null && (!emitidaEm || Number.isNaN(Date.parse(emitidaEm)))) return { erro: 'Data de emissão inválida.' }

  const itens = itensValidos(p.itens)
  if ('erro' in itens) return itens

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('importar_cotacao_propria', {
    p_cotacao: {
      numero,
      unidade: texto(p.unidade, 200),
      emitida_em: emitidaEm,
      arquivo_url: arquivoUrl,
      arquivo_nome: arquivoNome,
    } as Json,
    p_itens: itens as unknown as Json,
  })
  if (error) return { erro: mensagemErroBanco(error, { duplicado: `A cotação ${numero} já foi importada.` }) }

  revalidatePath('/cotacoes-proprias')
  revalidatePath('/insumos', 'layout')
  return { id }
}

// Mapa aprovado (ou exportado) congela a cotação: é o registro da compra
async function temMapaFechado(supabase: Supabase, cotacaoPropriaId: string): Promise<boolean> {
  const { count } = await supabase
    .from('mapas_cotacao')
    .select('id', { count: 'exact', head: true })
    .eq('cotacao_propria_id', cotacaoPropriaId)
    .in('status', ['aprovado', 'exportado'])
  return !!count
}

// O insumo do produto incluído. O código do sistema da farmácia manda, como
// na importação; sem insumo com esse código, vale o escolhido na busca (que
// recebe o código depois de incluído: semCodigo) ou, fora do cadastro, um
// insumo novo com o nome digitado
async function insumoDoProduto(
  supabase: Supabase,
  { codigo, insumoId, nomeNovo, unidade }: { codigo: string; insumoId: string | null; nomeNovo: string | null; unidade: string },
): Promise<{ id: string; nome: string; criado: boolean; semCodigo: boolean } | Falha> {
  const { data: porCodigo, error } = await supabase.from('insumos').select('id, nome_padrao').eq('codigo', codigo).maybeSingle()
  if (error) return { erro: error.message }
  if (porCodigo) {
    if (insumoId && porCodigo.id !== insumoId) {
      return { erro: `O código ${codigo} é de outro insumo do cadastro: ${porCodigo.nome_padrao}.` }
    }
    return { id: porCodigo.id, nome: porCodigo.nome_padrao, criado: false, semCodigo: false }
  }

  if (insumoId) {
    const { data: escolhido } = await supabase.from('insumos').select('id, nome_padrao, codigo').eq('id', insumoId).maybeSingle()
    if (!escolhido) return { erro: 'Insumo não encontrado no cadastro.' }
    if (escolhido.codigo) return { erro: `${escolhido.nome_padrao} tem o código ${escolhido.codigo} no cadastro, não ${codigo}.` }
    return { id: escolhido.id, nome: escolhido.nome_padrao, criado: false, semCodigo: true }
  }

  const { data: criado, error: erroNovo } = await supabase
    .from('insumos')
    .insert({ nome_padrao: nomeNovo!, unidade_padrao: unidade, codigo })
    .select('id, nome_padrao')
    .single()
  if (erroNovo || !criado) {
    return {
      erro: erroNovo
        ? mensagemErroBanco(erroNovo, { duplicado: `Já existe "${nomeNovo}" no cadastro de insumos: busque por ele.` })
        : 'Não foi possível criar o insumo.',
    }
  }
  return { id: criado.id, nome: criado.nome_padrao, criado: true, semCodigo: false }
}

// Itens de orçamentos já lidos que ficaram sem produto pedido e cuja descrição
// o comprador já confirmou como este insumo (sinônimo) passam a ser ofertas dele
async function ligarOfertasPorSinonimo(supabase: Supabase, cotacaoPropriaId: string, pedidoId: string, insumoId: string) {
  const [{ data: sinonimos }, { data: orcamentos }] = await Promise.all([
    supabase.from('insumo_sinonimos').select('sinonimo').eq('insumo_id', insumoId),
    supabase.from('cotacoes').select('id').eq('cotacao_propria_id', cotacaoPropriaId),
  ])
  const chaves = new Set((sinonimos ?? []).map((s) => chaveDescricao(s.sinonimo)))
  if (!chaves.size || !orcamentos?.length) return 0

  const soltos = await buscarTodos((de, ate) =>
    supabase
      .from('cotacao_itens')
      .select('id, descricao_original')
      .in('cotacao_id', orcamentos.map((o) => o.id))
      .is('cotacao_propria_item_id', null)
      .order('id')
      .range(de, ate),
  )
  const ids = soltos.filter((i) => chaves.has(chaveDescricao(i.descricao_original))).map((i) => i.id)
  if (!ids.length) return 0

  const { error } = await supabase
    .from('cotacao_itens')
    .update({ cotacao_propria_item_id: pedidoId, insumo_id: insumoId, vinculo_origem: 'sinonimo', vinculo_obs: null })
    .in('id', ids)
  if (error) {
    console.warn(`[cotacao-propria] não foi possível ligar ofertas ao produto incluído: ${error.message}`)
    return 0
  }
  return ids.length
}

// Produto que faltou na cotação gerada pelo sistema da farmácia, incluído à mão
export async function incluirProdutoNaCotacao(payload: unknown): Promise<Falha | { codigo: string; nome: string; ofertas: number }> {
  const p = (payload ?? {}) as Record<string, unknown>
  const cotacaoPropriaId = texto(p.cotacaoPropriaId, 36)
  const insumoId = p.insumoId == null ? null : texto(p.insumoId, 36)
  const codigo = texto(p.codigo, 15)
  const nomeNovo = p.nome == null ? null : texto(p.nome, 300)
  const unidade = normalizarUnidade(typeof p.unidade === 'string' ? p.unidade : null)
  const teor = p.teor == null ? null : Number(p.teor)
  const quantidade = Number(p.quantidade)

  if (!cotacaoPropriaId || !UUID.test(cotacaoPropriaId)) return { erro: 'Cotação inválida.' }
  if (p.insumoId != null && (!insumoId || !UUID.test(insumoId))) return { erro: 'Insumo inválido.' }
  if (!insumoId && !nomeNovo) return { erro: 'Escolha o insumo no cadastro ou digite o nome do produto.' }
  if (!codigo || !/^\d+$/.test(codigo)) return { erro: 'Informe o código do produto no sistema da farmácia (só números).' }
  if (teor != null && !(Number.isFinite(teor) && teor >= 0 && teor <= 100)) return { erro: 'O teor vai de 0 a 100%.' }
  if (!(Number.isFinite(quantidade) && quantidade > 0)) return { erro: 'Informe a quantidade pedida.' }
  if (!ehUnidadeQuantidade(unidade)) return { erro: 'Unidade inválida.' }

  const supabase = await createClient()
  const [{ data: cotacao }, fechado, { data: mesmoCodigo }] = await Promise.all([
    supabase.from('cotacoes_proprias').select('id').eq('id', cotacaoPropriaId).maybeSingle(),
    temMapaFechado(supabase, cotacaoPropriaId),
    supabase
      .from('cotacao_propria_itens')
      .select('nome')
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .eq('codigo', codigo)
      .limit(1)
      .maybeSingle(),
  ])
  if (!cotacao) return { erro: 'Cotação não encontrada.' }
  if (fechado) return { erro: MAPA_FECHADO }
  if (mesmoCodigo) return { erro: `O código ${codigo} já está nesta cotação: ${mesmoCodigo.nome}.` }

  const insumo = await insumoDoProduto(supabase, { codigo, insumoId, nomeNovo, unidade })
  if ('erro' in insumo) return insumo

  const [{ data: mesmoInsumo }, { data: ultimo }] = await Promise.all([
    supabase
      .from('cotacao_propria_itens')
      .select('codigo, nome')
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .eq('insumo_id', insumo.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cotacao_propria_itens')
      .select('ordem')
      .eq('cotacao_propria_id', cotacaoPropriaId)
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (mesmoInsumo) return { erro: `Este insumo já está na cotação como ${mesmoInsumo.codigo} - ${mesmoInsumo.nome}.` }

  const { data: item, error } = await supabase
    .from('cotacao_propria_itens')
    .insert({
      cotacao_propria_id: cotacaoPropriaId,
      ordem: (ultimo?.ordem ?? 0) + 1,
      codigo,
      ean: null,
      nome: insumo.nome,
      teor,
      quantidade,
      unidade,
      insumo_id: insumo.id,
    })
    .select('id')
    .single()
  if (error || !item) {
    return { erro: error ? mensagemErroBanco(error, { duplicado: `O código ${codigo} já está nesta cotação.` }) : 'Não foi possível incluir o produto.' }
  }

  // O insumo escolhido na busca passa a ter o código, como na importação
  if (insumo.semCodigo) {
    const { error: erroCodigo } = await supabase.from('insumos').update({ codigo }).eq('id', insumo.id).is('codigo', null)
    if (erroCodigo) console.warn(`[cotacao-propria] não foi possível gravar o código ${codigo} no insumo: ${erroCodigo.message}`)
  }

  const ofertas = await ligarOfertasPorSinonimo(supabase, cotacaoPropriaId, item.id, insumo.id)

  revalidatePath(`/cotacoes-proprias/${cotacaoPropriaId}`)
  revalidatePath('/cotacoes-proprias')
  revalidatePath('/mapas', 'layout')
  if (insumo.criado || insumo.semCodigo) revalidatePath('/insumos', 'layout')
  return { codigo, nome: insumo.nome, ofertas }
}

// Desfaz uma inclusão à mão. Os produtos que vieram no PDF ficam: são o pedido
// do sistema da farmácia
export async function removerProdutoIncluido(itemId: string, cotacaoPropriaId: string): Promise<Falha | void> {
  if (!UUID.test(itemId) || !UUID.test(cotacaoPropriaId)) return { erro: 'Produto inválido.' }
  const supabase = await createClient()

  const [{ data: item }, { data: cotacao }, fechado, { count: ofertas }] = await Promise.all([
    supabase.from('cotacao_propria_itens').select('created_at').eq('id', itemId).eq('cotacao_propria_id', cotacaoPropriaId).maybeSingle(),
    supabase.from('cotacoes_proprias').select('created_at').eq('id', cotacaoPropriaId).maybeSingle(),
    temMapaFechado(supabase, cotacaoPropriaId),
    supabase.from('cotacao_itens').select('id', { count: 'exact', head: true }).eq('cotacao_propria_item_id', itemId),
  ])
  if (!item || !cotacao) return { erro: 'Produto não encontrado nesta cotação.' }
  if (!incluidoAMao(item.created_at, cotacao.created_at)) return { erro: 'Só sai da cotação o produto incluído à mão.' }
  if (fechado) return { erro: MAPA_FECHADO }
  if (ofertas) {
    return { erro: 'Há itens de orçamento ligados a este produto. Troque o produto deles na página do orçamento antes de tirá-lo da cotação.' }
  }

  const { error } = await supabase.from('cotacao_propria_itens').delete().eq('id', itemId)
  if (error) return { erro: error.message }
  revalidatePath(`/cotacoes-proprias/${cotacaoPropriaId}`)
  revalidatePath('/cotacoes-proprias')
  revalidatePath('/mapas', 'layout')
}

export async function excluirCotacaoPropria(id: string): Promise<Falha | void> {
  const supabase = await createClient()

  // Mapa em rascunho vai junto; aprovado ou cancelado é registro de compra
  const { count: mapasFechados } = await supabase
    .from('mapas_cotacao')
    .select('id', { count: 'exact', head: true })
    .eq('cotacao_propria_id', id)
    .neq('status', 'rascunho')
  if (mapasFechados) {
    return { erro: 'Esta cotação tem mapa aprovado ou cancelado, que fica no histórico de compras. Ela não pode ser excluída.' }
  }

  // Os orçamentos saem junto (cascata): os arquivos deles também têm de sair do Storage
  const [{ data: cotacao }, { data: orcamentos }] = await Promise.all([
    supabase.from('cotacoes_proprias').select('arquivo_url').eq('id', id).single(),
    supabase.from('cotacoes').select('arquivo_url').eq('cotacao_propria_id', id),
  ])
  const { error } = await supabase.from('cotacoes_proprias').delete().eq('id', id)
  if (error) return { erro: error.message }

  await removerArquivos(supabase, [cotacao?.arquivo_url ?? null, ...(orcamentos ?? []).map((o) => o.arquivo_url)])
  revalidatePath('/cotacoes-proprias')
  revalidatePath('/mapas')
}
