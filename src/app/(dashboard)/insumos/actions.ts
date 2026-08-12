'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

export async function criarInsumo(formData: FormData) {
  const supabase = createServiceClient()

  const { data: insumo, error } = await supabase
    .from('insumos')
    .insert({
      nome_padrao: formData.get('nome_padrao') as string,
      cas_number: (formData.get('cas_number') as string) || null,
      unidade_padrao: formData.get('unidade_padrao') as string,
      descricao: (formData.get('descricao') as string) || null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  const sinonimosRaw = formData.get('sinonimos') as string
  if (sinonimosRaw) {
    const sinonimos = JSON.parse(sinonimosRaw) as string[]
    const registros = sinonimos.filter(Boolean).map((s) => ({ insumo_id: insumo.id, sinonimo: s }))
    if (registros.length) await supabase.from('insumo_sinonimos').insert(registros)
  }

  revalidatePath('/insumos')
  redirect('/insumos')
}

export async function atualizarInsumo(id: string, formData: FormData) {
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('insumos')
    .update({
      nome_padrao: formData.get('nome_padrao') as string,
      cas_number: (formData.get('cas_number') as string) || null,
      unidade_padrao: formData.get('unidade_padrao') as string,
      descricao: (formData.get('descricao') as string) || null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Re-sincroniza sinônimos: apaga todos e recria
  const sinonimosRaw = formData.get('sinonimos') as string
  await supabase.from('insumo_sinonimos').delete().eq('insumo_id', id)
  if (sinonimosRaw) {
    const sinonimos = JSON.parse(sinonimosRaw) as string[]
    const registros = sinonimos.filter(Boolean).map((s) => ({ insumo_id: id, sinonimo: s }))
    if (registros.length) await supabase.from('insumo_sinonimos').insert(registros)
  }

  revalidatePath('/insumos')
  redirect('/insumos')
}

export async function excluirInsumo(id: string) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('insumos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/insumos')
}
