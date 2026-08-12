'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

export async function criarFornecedor(formData: FormData) {
  const supabase = createServiceClient()

  const dados = {
    razao_social: formData.get('razao_social') as string,
    nome_fantasia: (formData.get('nome_fantasia') as string) || null,
    cnpj: (formData.get('cnpj') as string) || null,
    email: (formData.get('email') as string) || null,
    telefone: (formData.get('telefone') as string) || null,
    ativo: true,
  }

  const { error } = await supabase.from('fornecedores').insert(dados)
  if (error) throw new Error(error.message)

  revalidatePath('/fornecedores')
  redirect('/fornecedores')
}

export async function atualizarFornecedor(id: string, formData: FormData) {
  const supabase = createServiceClient()

  const dados = {
    razao_social: formData.get('razao_social') as string,
    nome_fantasia: (formData.get('nome_fantasia') as string) || null,
    cnpj: (formData.get('cnpj') as string) || null,
    email: (formData.get('email') as string) || null,
    telefone: (formData.get('telefone') as string) || null,
    ativo: formData.get('ativo') === 'true',
  }

  const { error } = await supabase.from('fornecedores').update(dados).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/fornecedores')
  redirect('/fornecedores')
}

export async function excluirFornecedor(id: string) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('fornecedores').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/fornecedores')
}
