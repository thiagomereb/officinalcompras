'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mensagemErroBanco, type Falha } from '@/lib/acoes'

const MSG_DUPLICADO = 'Já existe um fornecedor com este código.'

function dadosDoForm(formData: FormData) {
  return {
    razao_social: String(formData.get('razao_social') ?? '').trim(),
    // Código do fornecedor no sistema da farmácia
    codigo: String(formData.get('codigo') ?? '').replace(/\D/g, '').slice(0, 10) || null,
    nome_fantasia: (formData.get('nome_fantasia') as string)?.trim() || null,
    cnpj: (formData.get('cnpj') as string)?.trim() || null,
    email: (formData.get('email') as string)?.trim() || null,
    telefone: (formData.get('telefone') as string)?.trim() || null,
  }
}

export async function criarFornecedor(formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  const dados = { ...dadosDoForm(formData), ativo: true }
  if (!dados.razao_social) return { erro: 'Informe a razão social.' }

  const { error } = await supabase.from('fornecedores').insert(dados)
  if (error) return { erro: mensagemErroBanco(error, { duplicado: MSG_DUPLICADO }) }

  revalidatePath('/fornecedores')
  redirect('/fornecedores')
}

export async function atualizarFornecedor(id: string, formData: FormData): Promise<Falha | void> {
  const supabase = await createClient()

  // O form manda um hidden 'false' antes do checkbox 'true' (para o desmarcado
  // também chegar); get() leria sempre o hidden e desativaria o fornecedor.
  const dados = { ...dadosDoForm(formData), ativo: formData.getAll('ativo').includes('true') }
  if (!dados.razao_social) return { erro: 'Informe a razão social.' }

  const { error } = await supabase.from('fornecedores').update(dados).eq('id', id)
  if (error) return { erro: mensagemErroBanco(error, { duplicado: MSG_DUPLICADO }) }

  revalidatePath('/fornecedores')
  redirect('/fornecedores')
}

// Excluir um fornecedor com cotações apagaria todo o histórico de preços dele
// (e quebraria mapas já aprovados). Nesse caso o caminho é desativá-lo; o
// banco também barra a exclusão (FK restrict em cotacoes.fornecedor_id).
export async function excluirFornecedor(id: string): Promise<Falha | void> {
  const supabase = await createClient()

  const { count } = await supabase
    .from('cotacoes')
    .select('id', { count: 'exact', head: true })
    .eq('fornecedor_id', id)
  if (count) {
    return {
      erro: `Este fornecedor tem ${count} cotação(ões) registrada(s). Para preservar o histórico, desative-o (desmarque "Fornecedor ativo" e salve) em vez de excluir.`,
    }
  }

  const { error } = await supabase.from('fornecedores').delete().eq('id', id)
  if (error) {
    return { erro: mensagemErroBanco(error, { emUso: 'Este fornecedor tem cotações registradas. Desative-o em vez de excluir.' }) }
  }

  revalidatePath('/fornecedores')
}
