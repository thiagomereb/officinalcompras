'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mensagemErroBanco, type Falha } from '@/lib/acoes'
import { colunaCodigo, comCodigo, ehUnidadeFarmacia, nomeUnidade, unidadeDaCotacao } from '@/lib/unidades-farmacia'

const MSG_DUPLICADO = 'Já existe um insumo com este nome.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Põe, troca ou tira (codigoNovo null) o código do insumo numa unidade da
// farmácia. As linhas incluídas à mão deste insumo em cotações dessa unidade
// ainda abertas passam a usar o código novo; as que vieram no PDF ficam como o
// relatório trouxe.
export async function alterarCodigoInsumo(
  insumoId: string,
  unidade: string,
  codigoNovo: string | null,
): Promise<Falha | { linhas: number }> {
  const novo = codigoNovo?.trim() || null
  if (!UUID.test(insumoId) || !ehUnidadeFarmacia(unidade)) return { erro: 'Insumo ou unidade inválida.' }
  if (novo && !/^\d{1,15}$/.test(novo)) return { erro: 'O código tem só números (até 15).' }

  const supabase = await createClient()
  const coluna = colunaCodigo(unidade)

  if (novo) {
    const { data: dono, error } = await supabase.from('insumos').select('id, nome_padrao').eq(coluna, novo).maybeSingle()
    if (error) return { erro: error.message }
    if (dono && dono.id !== insumoId) {
      return { erro: `Em ${nomeUnidade(unidade)}, o código ${novo} já é de ${dono.nome_padrao}. Tire de lá antes.` }
    }
  }

  const { error: erroCodigo } = await supabase.from('insumos').update(comCodigo(unidade, novo)).eq('id', insumoId)
  if (erroCodigo) {
    return { erro: mensagemErroBanco(erroCodigo, { duplicado: `Em ${nomeUnidade(unidade)}, o código ${novo} já é de outro insumo.` }) }
  }

  // Linhas incluídas à mão (horário diferente do da importação) deste insumo,
  // em cotações da unidade sem mapa aprovado
  let linhas = 0
  if (novo) {
    const { data: cotacoes } = await supabase
      .from('cotacoes_proprias')
      .select('id, unidade, created_at, mapas_cotacao(status)')
    const abertas = (cotacoes ?? []).filter(
      (c) =>
        unidadeDaCotacao(c.unidade) === unidade &&
        !(c.mapas_cotacao as { status: string }[] | null)?.some((m) => m.status === 'aprovado' || m.status === 'exportado'),
    )
    for (const c of abertas) {
      const { data: alteradas, error } = await supabase
        .from('cotacao_propria_itens')
        .update({ codigo: novo })
        .eq('cotacao_propria_id', c.id)
        .eq('insumo_id', insumoId)
        .neq('created_at', c.created_at)
        .neq('codigo', novo)
        .select('id')
      if (error) return { erro: error.message }
      linhas += alteradas?.length ?? 0
    }
  }

  revalidatePath(`/insumos/${insumoId}`)
  if (linhas) revalidatePath('/cotacoes-proprias', 'layout')
  return { linhas }
}

function dadosDoForm(formData: FormData) {
  return {
    nome_padrao: String(formData.get('nome_padrao') ?? '').trim(),
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
