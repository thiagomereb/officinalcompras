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
import { extrairItensOCR, type ItemExtraido } from '@/lib/ocr'
import { extrairItensExcel } from '@/lib/excel'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'

const EXTENSOES_EXCEL = ['xlsx', 'xls']

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

export async function extrairComOCR(cotacaoId: string): Promise<{ count: number }> {
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

  const extArquivo = (cotacao.arquivo_nome ?? '').split('.').pop()?.toLowerCase() ?? ''
  const itens: ItemExtraido[] = EXTENSOES_EXCEL.includes(extArquivo)
    ? extrairItensExcel(await (await fetch(signedUrl)).arrayBuffer())
    : await extrairItensOCR(signedUrl, cotacao.arquivo_nome ?? 'arquivo.jpg')

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
  return { count: itens.length }
}

// Roda o OCR sequencialmente em várias cotações selecionadas na listagem — uma
// por vez, para não estourar o circuit breaker de rate limit da Edge Function.
export async function extrairEmLote(
  cotacaoIds: string[],
): Promise<{ id: string; ok: boolean; count?: number; erro?: string }[]> {
  const resultados: { id: string; ok: boolean; count?: number; erro?: string }[] = []

  for (const id of cotacaoIds) {
    try {
      const { count } = await extrairComOCR(id)
      resultados.push({ id, ok: true, count })
    } catch (err) {
      resultados.push({ id, ok: false, erro: (err as Error).message })
    }
  }

  revalidatePath('/cotacoes')
  return resultados
}

export async function uploadEExtrair(cotacaoId: string, formData: FormData): Promise<{ count: number }> {
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

  let itens: ItemExtraido[]
  if (isExcel) {
    itens = extrairItensExcel(await arquivo.arrayBuffer())
  } else {
    const signedUrl = await getArquivoSignedUrl(supabase, path)
    if (!signedUrl) throw new Error('Não foi possível acessar o arquivo enviado.')
    itens = await extrairItensOCR(signedUrl, arquivo.name)
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

  if (error) throw new Error(error.message)

  await supabase
    .from('cotacoes')
    .update({ status: 'processado' })
    .eq('id', cotacaoId)
    .eq('status', 'processando')

  revalidatePath(`/cotacoes/${cotacaoId}`)
  return { count: itens.length }
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
