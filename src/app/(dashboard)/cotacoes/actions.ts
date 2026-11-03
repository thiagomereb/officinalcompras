'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ItemExtraido, PreparoExtracao } from '@/lib/ocr'
import { extrairItensExcel } from '@/lib/excel'
import { getArquivoSignedUrl, removerArquivos } from '@/lib/supabase/storage'
import { normalizarUnidade } from '@/lib/unidades'
import { mensagemErroBanco, type Falha } from '@/lib/acoes'

type Supabase = Awaited<ReturnType<typeof createClient>>

const EXTENSOES_EXCEL = ['xlsx', 'xls']

// Similaridade mínima (pg_trgm) para vincular um item a um insumo sem revisão
const LIMIAR_VINCULO = 0.45

// Formato dos paths gerados por enviarArquivoCotacao (lib/supabase/upload.ts).
// Como o path chega do navegador, só aceita objetos na raiz do bucket.
const PATH_ARQUIVO = /^\d+-[a-z0-9]+\.(jpe?g|png|webp|pdf|xlsx|xls)$/

const MSG_ITEM_EM_MAPA =
  'Há itens desta cotação escolhidos em um mapa de cotação. Num rascunho, desfaça a escolha (ou exclua o mapa); se o mapa já foi aprovado, a cotação fica guardada como registro da compra.'

function textoOuNulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// Vazio vira null, mas 0 continua 0 (frete 0, IPI 0 são valores válidos)
function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

type Condicoes = {
  fornecedor_id: string
  data_cotacao: string
  validade_cotacao: string | null
  prazo_entrega_dias: number | null
  prazo_pagamento_dias: number | null
  pedido_minimo: number | null
  frete_fixo: number | null
  frete_gratis_acima: number | null
}

function condicoesDoForm(formData: FormData): Condicoes | Falha {
  const fornecedor_id = textoOuNulo(formData.get('fornecedor_id'))
  const data_cotacao = textoOuNulo(formData.get('data_cotacao'))
  if (!fornecedor_id) return { erro: 'Selecione um fornecedor.' }
  if (!data_cotacao) return { erro: 'Informe a data da cotação.' }

  const condicoes: Condicoes = {
    fornecedor_id,
    data_cotacao,
    validade_cotacao: textoOuNulo(formData.get('validade_cotacao')),
    prazo_entrega_dias: numeroOuNulo(formData.get('prazo_entrega_dias')),
    prazo_pagamento_dias: numeroOuNulo(formData.get('prazo_pagamento_dias')),
    pedido_minimo: numeroOuNulo(formData.get('pedido_minimo')),
    frete_fixo: numeroOuNulo(formData.get('frete_fixo')),
    frete_gratis_acima: numeroOuNulo(formData.get('frete_gratis_acima')),
  }

  const numeros = [
    condicoes.prazo_entrega_dias,
    condicoes.prazo_pagamento_dias,
    condicoes.pedido_minimo,
    condicoes.frete_fixo,
    condicoes.frete_gratis_acima,
  ]
  if (numeros.some((n) => n != null && n < 0)) return { erro: 'Prazos e valores não podem ser negativos.' }
  if (
    [condicoes.prazo_entrega_dias, condicoes.prazo_pagamento_dias].some((n) => n != null && !Number.isInteger(n))
  ) {
    return { erro: 'Prazos devem ser em dias inteiros.' }
  }

  return condicoes
}

// Os itens chegam do navegador (que fala direto com a Edge Function de OCR),
// então valida o formato aqui em vez de confiar no que vem pela rede.
function sanitizarItens(itens: unknown): ItemExtraido[] {
  if (!Array.isArray(itens)) return []

  return itens.flatMap((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>
    const descricao = textoOuNulo(item.descricao)
    const preco = numeroOuNulo(item.preco_unitario)
    if (!descricao || preco === null || preco <= 0) return []

    return [
      {
        descricao,
        preco_unitario: preco,
        quantidade_embalagem: numeroOuNulo(item.quantidade_embalagem),
        quantidade: numeroOuNulo(item.quantidade),
        unidade: textoOuNulo(item.unidade),
        pais_origem: textoOuNulo(item.pais_origem),
        ipi: numeroOuNulo(item.ipi),
        st: numeroOuNulo(item.st),
        validade: textoOuNulo(item.validade),
        cas: textoOuNulo(item.cas),
      },
    ]
  })
}

async function vincular(supabase: Supabase, cotacaoId: string): Promise<number | Falha> {
  const { data, error } = await supabase.rpc('vincular_itens_cotacao', {
    p_cotacao_id: cotacaoId,
    p_limiar: LIMIAR_VINCULO,
  })
  if (error) return { erro: error.message }
  return data ?? 0
}

// substituir: reextrair o mesmo arquivo troca os itens em vez de duplicá-los.
async function gravarItens(
  supabase: Supabase,
  cotacaoId: string,
  itens: ItemExtraido[],
  substituir: boolean,
): Promise<number | Falha> {
  if (substituir) {
    const { error } = await supabase.from('cotacao_itens').delete().eq('cotacao_id', cotacaoId)
    if (error) return { erro: mensagemErroBanco(error, { emUso: MSG_ITEM_EM_MAPA }) }
  }

  const { error } = await supabase.from('cotacao_itens').insert(
    itens.map((item) => ({
      cotacao_id: cotacaoId,
      descricao_original: item.descricao,
      preco_unitario: item.preco_unitario,
      quantidade_minima: item.quantidade_embalagem,
      quantidade: item.quantidade,
      unidade: normalizarUnidade(item.unidade),
      pais_origem: item.pais_origem,
      ipi: item.ipi ?? 0,
      st: item.st ?? 0,
      validade: item.validade,
      cas: item.cas ?? null,
      insumo_id: null,
    })),
  )
  if (error) return { erro: error.message }

  await supabase.from('cotacoes').update({ status: 'processado' }).eq('id', cotacaoId)

  // O vínculo é só uma conveniência: se falhar, os itens já estão salvos e
  // podem ser vinculados depois pelo botão "Vincular automaticamente".
  const vinculo = await vincular(supabase, cotacaoId)
  if (typeof vinculo !== 'number') console.warn(`[gravarItens] vínculo automático falhou: ${vinculo.erro}`)

  revalidatePath(`/cotacoes/${cotacaoId}`)
  revalidatePath('/cotacoes')
  return itens.length
}

export async function criarCotacao(formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const condicoes = condicoesDoForm(formData)
  if ('erro' in condicoes) return condicoes

  // arquivo_url guarda o path do objeto no storage (bucket privado); o acesso
  // real é sempre via signed URL gerada sob demanda em getArquivoSignedUrl.
  // O upload em si já foi feito pelo navegador (enviarArquivoCotacao).
  const arquivo_url = textoOuNulo(formData.get('arquivo_path'))
  const arquivo_nome = textoOuNulo(formData.get('arquivo_nome'))
  if (arquivo_url && !PATH_ARQUIVO.test(arquivo_url)) return { erro: 'Arquivo enviado inválido.' }

  const { data: cotacao, error } = await supabase
    .from('cotacoes')
    .insert({
      ...condicoes,
      arquivo_url,
      arquivo_nome: arquivo_url ? arquivo_nome : null,
      status: 'processando',
    })
    .select('id')
    .single()

  if (error) return { erro: error.message }

  revalidatePath('/cotacoes')
  redirect(`/cotacoes/${cotacao.id}`)
}

export async function atualizarCotacao(id: string, formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const condicoes = condicoesDoForm(formData)
  if ('erro' in condicoes) return condicoes

  const { error } = await supabase.from('cotacoes').update(condicoes).eq('id', id)
  if (error) return { erro: error.message }

  revalidatePath('/cotacoes')
  revalidatePath(`/cotacoes/${id}`)
  revalidatePath('/dashboard')
}

export async function adicionarItem(cotacaoId: string, formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const descricao = textoOuNulo(formData.get('descricao_original'))
  const preco = numeroOuNulo(formData.get('preco_unitario'))
  if (!descricao) return { erro: 'Informe a descrição do item.' }
  if (preco === null || preco <= 0) return { erro: 'Informe um preço maior que zero.' }

  let insumo_id = textoOuNulo(formData.get('insumo_id'))

  // Auto-vínculo: se o usuário não selecionou insumo, tenta encontrar pelo nome/sinônimo
  if (!insumo_id) {
    const { data: match } = await supabase
      .rpc('buscar_insumo_por_descricao', { p_descricao: descricao, p_limite: 1 })
    const melhor = match?.[0]
    if (melhor && melhor.similaridade >= LIMIAR_VINCULO) {
      insumo_id = melhor.insumo_id
    }
  }

  const { error } = await supabase.from('cotacao_itens').insert({
    cotacao_id: cotacaoId,
    insumo_id,
    descricao_original: descricao,
    unidade: normalizarUnidade(textoOuNulo(formData.get('unidade'))),
    quantidade_minima: numeroOuNulo(formData.get('quantidade_minima')),
    quantidade: numeroOuNulo(formData.get('quantidade')),
    preco_unitario: preco,
    lote: textoOuNulo(formData.get('lote')),
    validade: textoOuNulo(formData.get('validade')),
    pais_origem: textoOuNulo(formData.get('pais_origem')),
    ipi: numeroOuNulo(formData.get('ipi')) ?? 0,
    st: numeroOuNulo(formData.get('st')) ?? 0,
    cas: textoOuNulo(formData.get('cas')),
  })

  if (error) return { erro: error.message }

  // Marca cotação como processada ao adicionar o primeiro item
  await supabase
    .from('cotacoes')
    .update({ status: 'processado' })
    .eq('id', cotacaoId)
    .eq('status', 'processando')

  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function removerItem(id: string, cotacaoId: string): Promise<Falha | void> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotacao_itens').delete().eq('id', id)
  if (error) {
    return {
      erro: mensagemErroBanco(error, {
        emUso: 'Este item foi escolhido em um mapa de cotação. Num rascunho, desfaça a escolha; se o mapa já foi aprovado, o item fica guardado como registro da compra.',
      }),
    }
  }
  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function vincularItensAutomatico(cotacaoId: string): Promise<{ vinculados: number } | Falha> {
  const supabase = await createClient()
  const vinculados = await vincular(supabase, cotacaoId)
  if (typeof vinculados !== 'number') return vinculados

  revalidatePath(`/cotacoes/${cotacaoId}`)
  return { vinculados }
}

export async function vincularItemManualmente(itemId: string, insumoId: string, cotacaoId: string): Promise<Falha | void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotacao_itens')
    .update({ insumo_id: insumoId })
    .eq('id', itemId)
  if (error) return { erro: error.message }
  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function removerTodosItens(cotacaoId: string): Promise<Falha | void> {
  const supabase = await createClient()
  const { error } = await supabase.from('cotacao_itens').delete().eq('cotacao_id', cotacaoId)
  if (error) return { erro: mensagemErroBanco(error, { emUso: MSG_ITEM_EM_MAPA }) }

  await supabase.from('cotacoes').update({ status: 'processando' }).eq('id', cotacaoId)
  revalidatePath(`/cotacoes/${cotacaoId}`)
  revalidatePath('/cotacoes')
}

export async function excluirCotacao(id: string): Promise<Falha | void> {
  const supabase = await createClient()

  const { data: cotacao } = await supabase.from('cotacoes').select('arquivo_url').eq('id', id).single()

  const { error } = await supabase.from('cotacoes').delete().eq('id', id)
  if (error) return { erro: mensagemErroBanco(error, { emUso: MSG_ITEM_EM_MAPA }) }

  await removerArquivos(supabase, [cotacao?.arquivo_url ?? null])
  revalidatePath('/cotacoes')
  revalidatePath('/dashboard')
}

// Prepara a extração do arquivo anexado. Planilha resolve aqui mesmo (rápido);
// imagem/PDF devolve path + signed URL para o navegador conduzir o OCR.
export async function prepararExtracao(cotacaoId: string, substituir: boolean): Promise<PreparoExtracao | Falha> {
  const supabase = await createClient()

  const { data: cotacao } = await supabase
    .from('cotacoes')
    .select('arquivo_url')
    .eq('id', cotacaoId)
    .single()

  if (!cotacao?.arquivo_url) {
    return { erro: 'Esta cotação não tem arquivo anexado. Faça upload de uma imagem, PDF ou planilha.' }
  }

  const signedUrl = await getArquivoSignedUrl(supabase, cotacao.arquivo_url)
  if (!signedUrl) return { erro: 'Não foi possível acessar o arquivo anexado.' }

  // A extensão vem do path (gerado pelo app), não do nome original do arquivo
  const ext = cotacao.arquivo_url.split('.').pop()?.toLowerCase() ?? ''

  if (EXTENSOES_EXCEL.includes(ext)) {
    let itens: ItemExtraido[]
    try {
      itens = extrairItensExcel(await (await fetch(signedUrl)).arrayBuffer())
    } catch (err) {
      return { erro: (err as Error).message }
    }
    const count = await gravarItens(supabase, cotacaoId, itens, substituir)
    return typeof count === 'number' ? { modo: 'concluido', count } : count
  }

  return { modo: 'ocr', path: cotacao.arquivo_url, signedUrl }
}

// Associa à cotação um arquivo que o navegador acabou de enviar ao storage e
// prepara a extração dele. Os itens extraídos se somam aos que já existem.
export async function anexarArquivo(
  cotacaoId: string,
  path: string,
  nome: string,
): Promise<PreparoExtracao | Falha> {
  if (!PATH_ARQUIVO.test(path)) return { erro: 'Arquivo enviado inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cotacoes')
    .update({ arquivo_url: path, arquivo_nome: nome })
    .eq('id', cotacaoId)
  if (error) return { erro: error.message }

  return prepararExtracao(cotacaoId, false)
}

// Grava os itens que o navegador obteve da Edge Function de OCR.
export async function salvarItensExtraidos(
  cotacaoId: string,
  itens: unknown,
  substituir: boolean,
): Promise<{ count: number } | Falha> {
  const validos = sanitizarItens(itens)
  if (validos.length === 0) return { erro: 'Nenhum item com preço válido foi encontrado no arquivo.' }

  const supabase = await createClient()
  const count = await gravarItens(supabase, cotacaoId, validos, substituir)
  return typeof count === 'number' ? { count } : count
}

export async function lancarPrecos(payload: {
  fornecedor_id: string
  data_cotacao: string
  validade_cotacao?: string | null
  prazo_entrega_dias?: number | null
  prazo_pagamento_dias?: number | null
  items: {
    insumo_id: string
    preco_unitario: number
    quantidade_embalagem: number | null
    unidade: string | null
  }[]
}): Promise<Falha | void> {
  // Server Actions são endpoints públicos: o payload pode não ter o formato do tipo
  const fornecedor_id = textoOuNulo(payload?.fornecedor_id)
  const data_cotacao = textoOuNulo(payload?.data_cotacao)
  if (!fornecedor_id) return { erro: 'Selecione um fornecedor.' }
  if (!data_cotacao) return { erro: 'Informe a data da cotação.' }

  const items = (Array.isArray(payload.items) ? payload.items : []).flatMap((item) => {
    const insumo_id = textoOuNulo(item?.insumo_id)
    const preco = numeroOuNulo(item?.preco_unitario)
    if (!insumo_id || preco === null || preco <= 0) return []
    return [{
      insumo_id,
      preco_unitario: preco,
      quantidade_embalagem: numeroOuNulo(item.quantidade_embalagem),
      unidade: textoOuNulo(item.unidade),
    }]
  })
  if (items.length === 0) return { erro: 'Adicione pelo menos um insumo com preço maior que zero.' }

  const prazos = [numeroOuNulo(payload.prazo_entrega_dias), numeroOuNulo(payload.prazo_pagamento_dias)]
  if (prazos.some((n) => n != null && (n < 0 || !Number.isInteger(n)))) {
    return { erro: 'Prazos devem ser em dias inteiros, sem valores negativos.' }
  }

  const supabase = await createClient()

  const { data: cotacao, error: cotacaoError } = await supabase
    .from('cotacoes')
    .insert({
      fornecedor_id,
      data_cotacao,
      validade_cotacao: textoOuNulo(payload.validade_cotacao),
      prazo_entrega_dias: prazos[0],
      prazo_pagamento_dias: prazos[1],
      status: 'processado',
    })
    .select('id')
    .single()

  if (cotacaoError) return { erro: cotacaoError.message }

  const { data: insumosData } = await supabase
    .from('insumos')
    .select('id, nome_padrao')
    .in('id', items.map((i) => i.insumo_id))

  const nomeMap = new Map(insumosData?.map((i) => [i.id, i.nome_padrao]) ?? [])

  const { error: itemsError } = await supabase.from('cotacao_itens').insert(
    items.map((item) => ({
      cotacao_id: cotacao.id,
      insumo_id: item.insumo_id,
      descricao_original: nomeMap.get(item.insumo_id) ?? 'Insumo',
      preco_unitario: item.preco_unitario,
      quantidade_minima: item.quantidade_embalagem,
      unidade: normalizarUnidade(item.unidade),
    })),
  )

  if (itemsError) {
    // Sem itens a cotação recém-criada não serve para nada; desfaz para não
    // deixar uma cotação vazia marcada como processada.
    await supabase.from('cotacoes').delete().eq('id', cotacao.id)
    return { erro: itemsError.message }
  }

  revalidatePath('/cotacoes')
  revalidatePath('/dashboard')
}
