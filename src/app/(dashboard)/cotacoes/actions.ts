'use server'

import { revalidatePath } from 'next/cache'

function normalizarUnidade(u: string | null | undefined): string | null {
  if (!u) return null
  const map: Record<string, string> = {
    gr: 'g', grama: 'g', gramas: 'g',
    mg: 'mg', miligrama: 'mg', miligramas: 'mg',
    kg: 'kg', kilo: 'kg', quilograma: 'kg', quilogramas: 'kg',
    ml: 'mL', mililitro: 'mL', mililitros: 'mL',
    l: 'L', litro: 'L', litros: 'L',
    mcg: 'mcg', µg: 'mcg', ug: 'mcg',
    ui: 'UI', un: 'un', unidade: 'un', unidades: 'un',
    caps: 'cáps', cáps: 'cáps', capsula: 'cáps', cápsulas: 'cáps',
    comp: 'comp', comprimido: 'comp', comprimidos: 'comp',
  }
  const key = u.trim().toLowerCase()
  return map[key] ?? u.trim()
}
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ItemExtraido, PreparoExtracao } from '@/lib/ocr'
import { extrairItensExcel } from '@/lib/excel'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'

const EXTENSOES_EXCEL = ['xlsx', 'xls']

function textoOuNulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Os itens chegam do navegador (que fala direto com a Edge Function de OCR),
// então valida o formato aqui em vez de confiar no que vem pela rede.
function sanitizarItens(itens: unknown): ItemExtraido[] {
  if (!Array.isArray(itens)) throw new Error('Lista de itens inválida.')

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

async function gravarItens(cotacaoId: string, itens: ItemExtraido[]): Promise<number> {
  const supabase = await createClient()

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

  if (error) throw new Error(error.message)

  await supabase
    .from('cotacoes')
    .update({ status: 'processado' })
    .eq('id', cotacaoId)
    .eq('status', 'processando')

  revalidatePath(`/cotacoes/${cotacaoId}`)
  revalidatePath('/cotacoes')
  return itens.length
}

export async function criarCotacao(formData: FormData) {
  const supabase = await createClient()

  // arquivo_url guarda o path do objeto no storage (bucket privado); o acesso
  // real é sempre via signed URL gerada sob demanda em getArquivoSignedUrl.
  let arquivo_url: string | null = null
  let arquivo_nome: string | null = null

  const arquivo = formData.get('arquivo') as File | null
  if (arquivo && arquivo.size > 0) {
    const ext = arquivo.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('cotacoes')
      .upload(path, arquivo)
    if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`)
    arquivo_url = path
    arquivo_nome = arquivo.name
  }

  const { data: cotacao, error } = await supabase
    .from('cotacoes')
    .insert({
      fornecedor_id: formData.get('fornecedor_id') as string,
      data_cotacao: formData.get('data_cotacao') as string,
      validade_cotacao: (formData.get('validade_cotacao') as string) || null,
      prazo_entrega_dias: Number(formData.get('prazo_entrega_dias')) || null,
      prazo_pagamento_dias: Number(formData.get('prazo_pagamento_dias')) || null,
      pedido_minimo: Number(formData.get('pedido_minimo')) || null,
      frete_fixo: Number(formData.get('frete_fixo')) || null,
      frete_gratis_acima: Number(formData.get('frete_gratis_acima')) || null,
      arquivo_url,
      arquivo_nome,
      status: 'processando',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/cotacoes')
  redirect(`/cotacoes/${cotacao.id}`)
}

export async function atualizarCotacao(id: string, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('cotacoes')
    .update({
      fornecedor_id: formData.get('fornecedor_id') as string,
      data_cotacao: formData.get('data_cotacao') as string,
      validade_cotacao: (formData.get('validade_cotacao') as string) || null,
      prazo_entrega_dias: Number(formData.get('prazo_entrega_dias')) || null,
      prazo_pagamento_dias: Number(formData.get('prazo_pagamento_dias')) || null,
      pedido_minimo: Number(formData.get('pedido_minimo')) || null,
      frete_fixo: Number(formData.get('frete_fixo')) || null,
      frete_gratis_acima: Number(formData.get('frete_gratis_acima')) || null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/cotacoes')
  revalidatePath(`/cotacoes/${id}`)
}

export async function adicionarItem(cotacaoId: string, formData: FormData) {
  const supabase = await createClient()

  const descricao = formData.get('descricao_original') as string
  let insumo_id = (formData.get('insumo_id') as string) || null

  // Auto-vínculo: se o usuário não selecionou insumo, tenta encontrar pelo nome/sinônimo
  if (!insumo_id && descricao) {
    const { data: match } = await supabase
      .rpc('buscar_insumo_por_descricao', { p_descricao: descricao, p_limite: 1 })
    const melhor = match?.[0]
    if (melhor && melhor.similaridade >= 0.45) {
      insumo_id = melhor.insumo_id
    }
  }

  const { error } = await supabase.from('cotacao_itens').insert({
    cotacao_id: cotacaoId,
    insumo_id,
    descricao_original: descricao,
    unidade: normalizarUnidade((formData.get('unidade') as string) || null),
    quantidade_minima: Number(formData.get('quantidade_minima')) || null,
    quantidade: Number(formData.get('quantidade')) || null,
    preco_unitario: Number(formData.get('preco_unitario')),
    lote: (formData.get('lote') as string) || null,
    validade: (formData.get('validade') as string) || null,
    pais_origem: (formData.get('pais_origem') as string) || null,
    ipi: Number(formData.get('ipi')) || 0,
    st: Number(formData.get('st')) || 0,
    cas: (formData.get('cas') as string) || null,
  })

  if (error) throw new Error(error.message)

  // Marca cotação como processada ao adicionar o primeiro item
  await supabase
    .from('cotacoes')
    .update({ status: 'processado' })
    .eq('id', cotacaoId)
    .eq('status', 'processando')

  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function removerItem(id: string, cotacaoId: string) {
  const supabase = await createClient()
  await supabase.from('cotacao_itens').delete().eq('id', id)
  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function vincularItensAutomatico(cotacaoId: string): Promise<{ vinculados: number }> {
  const supabase = await createClient()

  const { data: itens } = await supabase
    .from('cotacao_itens')
    .select('id, descricao_original')
    .eq('cotacao_id', cotacaoId)
    .is('insumo_id', null)

  if (!itens?.length) return { vinculados: 0 }

  let vinculados = 0
  for (const item of itens) {
    const { data: match } = await supabase
      .rpc('buscar_insumo_por_descricao', { p_descricao: item.descricao_original, p_limite: 1 })
    const melhor = match?.[0]
    if (melhor && melhor.similaridade >= 0.45) {
      await supabase
        .from('cotacao_itens')
        .update({ insumo_id: melhor.insumo_id })
        .eq('id', item.id)
      vinculados++
    }
  }

  revalidatePath(`/cotacoes/${cotacaoId}`)
  return { vinculados }
}

export async function vincularItemManualmente(itemId: string, insumoId: string, cotacaoId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('cotacao_itens')
    .update({ insumo_id: insumoId })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function removerTodosItens(cotacaoId: string) {
  const supabase = await createClient()
  await supabase.from('cotacao_itens').delete().eq('cotacao_id', cotacaoId)
  revalidatePath(`/cotacoes/${cotacaoId}`)
}

export async function excluirCotacao(id: string) {
  const supabase = await createClient()
  await supabase.from('cotacoes').delete().eq('id', id)
  revalidatePath('/cotacoes')
}

// Prepara a extração do arquivo já anexado. Planilha resolve aqui mesmo
// (rápido); imagem/PDF devolve a signed URL para o navegador chamar o OCR.
export async function prepararExtracao(cotacaoId: string): Promise<PreparoExtracao> {
  const supabase = await createClient()

  const { data: cotacao } = await supabase
    .from('cotacoes')
    .select('arquivo_url, arquivo_nome')
    .eq('id', cotacaoId)
    .single()

  if (!cotacao?.arquivo_url) {
    throw new Error('Esta cotação não tem arquivo anexado. Faça upload de uma imagem da tabela de preços.')
  }

  const signedUrl = await getArquivoSignedUrl(supabase, cotacao.arquivo_url)
  if (!signedUrl) throw new Error('Não foi possível acessar o arquivo anexado.')

  const arquivoNome = cotacao.arquivo_nome ?? 'arquivo.jpg'
  const ext = arquivoNome.split('.').pop()?.toLowerCase() ?? ''

  if (EXTENSOES_EXCEL.includes(ext)) {
    const itens = extrairItensExcel(await (await fetch(signedUrl)).arrayBuffer())
    return { modo: 'concluido', count: await gravarItens(cotacaoId, itens) }
  }

  return { modo: 'ocr', signedUrl, arquivoNome }
}

// Sobe um arquivo novo para a cotação e prepara a extração dele.
export async function uploadArquivo(cotacaoId: string, formData: FormData): Promise<PreparoExtracao> {
  const supabase = await createClient()

  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo || arquivo.size === 0) throw new Error('Nenhum arquivo selecionado.')

  const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const isExcel = EXTENSOES_EXCEL.includes(ext)
  const isSupported = isExcel || ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)
  if (!isSupported) {
    throw new Error(`Formato "${ext}" não suportado. Envie uma imagem (JPEG, PNG ou WebP), PDF ou planilha (XLSX/XLS).`)
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: uploadError } = await supabase.storage.from('cotacoes').upload(path, arquivo)
  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`)

  await supabase
    .from('cotacoes')
    .update({ arquivo_url: path, arquivo_nome: arquivo.name })
    .eq('id', cotacaoId)

  if (isExcel) {
    const itens = extrairItensExcel(await arquivo.arrayBuffer())
    return { modo: 'concluido', count: await gravarItens(cotacaoId, itens) }
  }

  const signedUrl = await getArquivoSignedUrl(supabase, path)
  if (!signedUrl) throw new Error('Não foi possível acessar o arquivo enviado.')

  return { modo: 'ocr', signedUrl, arquivoNome: arquivo.name }
}

// Grava os itens que o navegador obteve da Edge Function de OCR.
export async function salvarItensExtraidos(
  cotacaoId: string,
  itens: unknown,
): Promise<{ count: number }> {
  const validos = sanitizarItens(itens)
  if (validos.length === 0) throw new Error('Nenhum item com preço válido foi encontrado no arquivo.')

  return { count: await gravarItens(cotacaoId, validos) }
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
}) {
  const supabase = await createClient()

  const { data: cotacao, error: cotacaoError } = await supabase
    .from('cotacoes')
    .insert({
      fornecedor_id: payload.fornecedor_id,
      data_cotacao: payload.data_cotacao,
      validade_cotacao: payload.validade_cotacao ?? null,
      prazo_entrega_dias: payload.prazo_entrega_dias ?? null,
      prazo_pagamento_dias: payload.prazo_pagamento_dias ?? null,
      status: 'processado',
    })
    .select('id')
    .single()

  if (cotacaoError) throw new Error(cotacaoError.message)

  const insumoIds = payload.items.map((i) => i.insumo_id)
  const { data: insumosData } = await supabase
    .from('insumos')
    .select('id, nome_padrao')
    .in('id', insumoIds)

  const nomeMap = new Map(insumosData?.map((i) => [i.id, i.nome_padrao]) ?? [])

  const { error: itemsError } = await supabase.from('cotacao_itens').insert(
    payload.items.map((item) => ({
      cotacao_id: cotacao.id,
      insumo_id: item.insumo_id,
      descricao_original: nomeMap.get(item.insumo_id) ?? 'Insumo',
      preco_unitario: item.preco_unitario,
      quantidade_minima: item.quantidade_embalagem,
      unidade: normalizarUnidade(item.unidade),
    })),
  )

  if (itemsError) throw new Error(itemsError.message)

  revalidatePath('/cotacoes')
  revalidatePath('/dashboard')
}
