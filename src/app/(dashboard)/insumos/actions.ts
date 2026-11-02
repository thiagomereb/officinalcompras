'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mensagemErroBanco, type Falha } from '@/lib/acoes'

const MSG_DUPLICADO = 'Já existe um insumo com este nome ou número CAS.'

function dadosDoForm(formData: FormData) {
  return {
    nome_padrao: String(formData.get('nome_padrao') ?? '').trim(),
    cas_number: (formData.get('cas_number') as string)?.trim() || null,
    unidade_padrao: String(formData.get('unidade_padrao') ?? '').trim() || 'g',
    descricao: (formData.get('descricao') as string)?.trim() || null,
  }
}

// O editor de sinônimos manda a lista como JSON num campo oculto
function sinonimosDoForm(formData: FormData): string[] | Falha {
  const raw = formData.get('sinonimos')
  if (!raw) return []
  try {
    const lista = JSON.parse(String(raw))
    if (!Array.isArray(lista)) throw new Error()
    return [...new Set(lista.map((s) => String(s).trim()).filter(Boolean))]
  } catch {
    return { erro: 'Lista de sinônimos inválida.' }
  }
}

export async function criarInsumo(formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const dados = dadosDoForm(formData)
  if (!dados.nome_padrao) return { erro: 'Informe o nome padrão.' }
  const sinonimos = sinonimosDoForm(formData)
  if ('erro' in sinonimos) return sinonimos

  const { data: insumo, error } = await supabase.from('insumos').insert(dados).select('id').single()
  if (error) return { erro: mensagemErroBanco(error, { duplicado: MSG_DUPLICADO }) }

  if (sinonimos.length) {
    const { error: erroSinonimos } = await supabase
      .from('insumo_sinonimos')
      .insert(sinonimos.map((s) => ({ insumo_id: insumo.id, sinonimo: s })))
    if (erroSinonimos) return { erro: `Insumo criado, mas os sinônimos não foram salvos: ${erroSinonimos.message}` }
  }

  revalidatePath('/insumos')
  redirect('/insumos')
}

export async function atualizarInsumo(id: string, formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const dados = dadosDoForm(formData)
  if (!dados.nome_padrao) return { erro: 'Informe o nome padrão.' }
  const sinonimos = sinonimosDoForm(formData)
  if ('erro' in sinonimos) return sinonimos

  const { error } = await supabase.from('insumos').update(dados).eq('id', id)
  if (error) return { erro: mensagemErroBanco(error, { duplicado: MSG_DUPLICADO }) }

  // Sincroniza por diferença em vez de apagar tudo e recriar: se algo falhar no
  // meio, o insumo não fica sem sinônimos (e sem auto-vínculo) até a próxima edição.
  const { data: atuais, error: erroLeitura } = await supabase
    .from('insumo_sinonimos')
    .select('id, sinonimo')
    .eq('insumo_id', id)
  if (erroLeitura) return { erro: erroLeitura.message }

  const desejados = new Set(sinonimos)
  const existentes = new Set((atuais ?? []).map((s) => s.sinonimo))
  const remover = (atuais ?? []).filter((s) => !desejados.has(s.sinonimo)).map((s) => s.id)
  const inserir = sinonimos.filter((s) => !existentes.has(s))

  if (inserir.length) {
    const { error: erroInsert } = await supabase
      .from('insumo_sinonimos')
      .insert(inserir.map((s) => ({ insumo_id: id, sinonimo: s })))
    if (erroInsert) return { erro: `Insumo salvo, mas os sinônimos não: ${erroInsert.message}` }
  }
  if (remover.length) {
    const { error: erroDelete } = await supabase.from('insumo_sinonimos').delete().in('id', remover)
    if (erroDelete) return { erro: `Insumo salvo, mas os sinônimos não: ${erroDelete.message}` }
  }

  revalidatePath('/insumos')
  redirect('/insumos')
}

export async function excluirInsumo(id: string): Promise<Falha | void> {
  const supabase = await createClient()
  const { error } = await supabase.from('insumos').delete().eq('id', id)
  if (error) {
    return {
      erro: mensagemErroBanco(error, {
        emUso: 'Este insumo está vinculado a itens de cotação ou de mapas. Desvincule-os antes de excluir.',
      }),
    }
  }
  revalidatePath('/insumos')
}
