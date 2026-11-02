'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validarPesos, type Pesos } from '@/lib/comparacao'
import type { Falha } from '@/lib/acoes'

type Supabase = Awaited<ReturnType<typeof createClient>>

const MSG_APROVADO = 'Este mapa já foi aprovado e não pode mais ser alterado.'

async function mapaAprovado(supabase: Supabase, mapaId: string): Promise<boolean | Falha> {
  const { data, error } = await supabase.from('mapas_cotacao').select('status').eq('id', mapaId).single()
  if (error || !data) return { erro: 'Mapa não encontrado.' }
  return data.status !== 'rascunho'
}

export async function criarMapa(formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const titulo = String(formData.get('titulo') ?? '').trim()
  const cotacoesIds = formData.getAll('cotacoes_ids').map(String).filter(Boolean)
  const pesos: Pesos = {
    preco: Number(formData.get('peso_preco')),
    entrega: Number(formData.get('peso_entrega')),
    pagamento: Number(formData.get('peso_pagamento')),
    frete: Number(formData.get('peso_frete')),
  }

  if (!titulo) return { erro: 'Informe o título do mapa.' }
  if (cotacoesIds.length === 0) return { erro: 'Selecione pelo menos uma cotação.' }
  const erroPesos = validarPesos(pesos)
  if (erroPesos) return { erro: erroPesos }

  const { data, error } = await supabase
    .from('mapas_cotacao')
    .insert({
      titulo,
      cotacoes_ids: cotacoesIds,
      pesos,
      status: 'rascunho',
    })
    .select('id')
    .single()

  if (error) return { erro: error.message }

  revalidatePath('/mapas')
  redirect(`/mapas/${data.id}`)
}

export async function salvarSelecoes(
  mapaId: string,
  selecoes: { insumo_id: string; cotacao_item_id: string; quantidade: number }[]
): Promise<Falha | void> {
  const supabase = await createClient()

  const aprovado = await mapaAprovado(supabase, mapaId)
  if (typeof aprovado !== 'boolean') return aprovado
  if (aprovado) return { erro: MSG_APROVADO }

  const registros = (Array.isArray(selecoes) ? selecoes : []).map((s) => ({
    mapa_id: mapaId,
    insumo_id: String(s?.insumo_id ?? ''),
    cotacao_item_id: String(s?.cotacao_item_id ?? ''),
    quantidade: Number(s?.quantidade),
  }))
  if (registros.some((r) => !r.insumo_id || !r.cotacao_item_id)) return { erro: 'Seleção inválida.' }
  if (registros.some((r) => !Number.isFinite(r.quantidade) || r.quantidade < 0)) {
    return { erro: 'As quantidades devem ser números positivos.' }
  }

  // Grava as novas seleções antes de apagar as antigas: se a inserção falhar,
  // o mapa continua com o que estava salvo em vez de ficar vazio.
  const { data: anteriores, error: erroLeitura } = await supabase
    .from('mapa_cotacao_itens')
    .select('id')
    .eq('mapa_id', mapaId)
  if (erroLeitura) return { erro: erroLeitura.message }

  if (registros.length) {
    const { error } = await supabase.from('mapa_cotacao_itens').insert(registros)
    if (error) return { erro: error.message }
  }

  const idsAnteriores = (anteriores ?? []).map((a) => a.id)
  if (idsAnteriores.length) {
    const { error } = await supabase.from('mapa_cotacao_itens').delete().in('id', idsAnteriores)
    if (error) return { erro: error.message }
  }

  revalidatePath(`/mapas/${mapaId}`)
}

export async function aprovarMapa(mapaId: string): Promise<Falha | void> {
  const supabase = await createClient()

  const { count } = await supabase
    .from('mapa_cotacao_itens')
    .select('id', { count: 'exact', head: true })
    .eq('mapa_id', mapaId)
  if (!count) return { erro: 'Salve as seleções do mapa antes de aprová-lo.' }

  const { error } = await supabase
    .from('mapas_cotacao')
    .update({ status: 'aprovado' })
    .eq('id', mapaId)
    .eq('status', 'rascunho')
  if (error) return { erro: error.message }

  revalidatePath(`/mapas/${mapaId}`)
  revalidatePath('/mapas')
}

export async function excluirMapa(id: string): Promise<Falha | void> {
  const supabase = await createClient()
  const { error } = await supabase.from('mapas_cotacao').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/mapas')
}
