'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Pesos } from '@/lib/comparacao'

export async function criarMapa(formData: FormData) {
  const supabase = await createClient()

  const cotacoesIds = formData.getAll('cotacoes_ids') as string[]
  const pesos: Pesos = {
    preco: Number(formData.get('peso_preco')),
    entrega: Number(formData.get('peso_entrega')),
    pagamento: Number(formData.get('peso_pagamento')),
    frete: Number(formData.get('peso_frete')),
  }

  const { data, error } = await supabase
    .from('mapas_cotacao')
    .insert({
      titulo: formData.get('titulo') as string,
      cotacoes_ids: cotacoesIds,
      pesos,
      status: 'rascunho',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/mapas')
  redirect(`/mapas/${data.id}`)
}

export async function salvarSelecoes(
  mapaId: string,
  selecoes: { insumo_id: string; cotacao_item_id: string; quantidade: number }[]
) {
  const supabase = await createClient()

  await supabase.from('mapa_cotacao_itens').delete().eq('mapa_id', mapaId)

  if (selecoes.length) {
    const registros = selecoes.map((s) => ({
      mapa_id: mapaId,
      insumo_id: s.insumo_id,
      cotacao_item_id: s.cotacao_item_id,
      quantidade: s.quantidade,
    }))
    const { error } = await supabase.from('mapa_cotacao_itens').insert(registros)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/mapas/${mapaId}`)
}

export async function aprovarMapa(mapaId: string) {
  const supabase = await createClient()
  await supabase.from('mapas_cotacao').update({ status: 'aprovado' }).eq('id', mapaId)
  revalidatePath(`/mapas/${mapaId}`)
  revalidatePath('/mapas')
}

export async function excluirMapa(id: string) {
  const supabase = await createClient()
  await supabase.from('mapas_cotacao').delete().eq('id', id)
  revalidatePath('/mapas')
}
