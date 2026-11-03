'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validarPesos, PESOS_PADRAO, type Pesos } from '@/lib/comparacao'
import { carregarGruposMapa } from '@/lib/mapas'
import { montarAprovacao, type Escolha } from '@/lib/compras'
import { ehUnidadeQuantidade } from '@/lib/unidades'
import type { Falha } from '@/lib/acoes'
import type { Json } from '@/types/database'

type Supabase = Awaited<ReturnType<typeof createClient>>

const MSG_APROVADO = 'Este mapa já foi aprovado e não pode mais ser alterado.'
const LIMITE_MOTIVO = 500

async function statusDoMapa(supabase: Supabase, mapaId: string): Promise<string | Falha> {
  const { data, error } = await supabase.from('mapas_cotacao').select('status').eq('id', mapaId).single()
  if (error || !data) return { erro: 'Mapa não encontrado.' }
  return data.status
}

// O payload vem do navegador: valida cada campo em vez de confiar no tipo
function escolhasValidas(escolhas: unknown): Escolha[] | Falha {
  if (!Array.isArray(escolhas)) return { erro: 'Escolhas inválidas.' }
  const resultado: Escolha[] = []
  for (const raw of escolhas) {
    const e = (raw ?? {}) as Record<string, unknown>
    const insumo_id = typeof e.insumo_id === 'string' ? e.insumo_id : ''
    const cotacao_item_id = typeof e.cotacao_item_id === 'string' ? e.cotacao_item_id : ''
    if (!insumo_id || !cotacao_item_id) return { erro: 'Escolhas inválidas.' }

    const quantidade = e.quantidade == null || e.quantidade === '' ? null : Number(e.quantidade)
    if (quantidade != null && (!Number.isFinite(quantidade) || quantidade < 0)) {
      return { erro: 'As quantidades devem ser números positivos.' }
    }
    const unidade = e.quantidade_unidade == null || e.quantidade_unidade === '' ? null : e.quantidade_unidade
    if (unidade != null && !ehUnidadeQuantidade(unidade)) return { erro: 'Unidade de quantidade inválida.' }

    resultado.push({ insumo_id, cotacao_item_id, quantidade, quantidade_unidade: unidade })
  }
  return resultado
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

// Rascunho: grava o que o comprador escolheu até agora, sem validar se está completo
export async function salvarSelecoes(mapaId: string, escolhas: unknown): Promise<Falha | void> {
  const supabase = await createClient()

  const status = await statusDoMapa(supabase, mapaId)
  if (typeof status !== 'string') return status
  if (status !== 'rascunho') return { erro: MSG_APROVADO }

  const validas = escolhasValidas(escolhas)
  if ('erro' in validas) return validas

  // Grava as novas escolhas antes de apagar as antigas: se a inserção falhar,
  // o mapa continua com o que estava salvo em vez de ficar vazio.
  const { data: anteriores, error: erroLeitura } = await supabase
    .from('mapa_cotacao_itens')
    .select('id')
    .eq('mapa_id', mapaId)
  if (erroLeitura) return { erro: erroLeitura.message }

  if (validas.length) {
    const { error } = await supabase.from('mapa_cotacao_itens').insert(
      validas.map((e) => ({
        mapa_id: mapaId,
        insumo_id: e.insumo_id,
        cotacao_item_id: e.cotacao_item_id,
        quantidade: e.quantidade,
        quantidade_unidade: e.quantidade_unidade,
      })),
    )
    if (error) return { erro: error.message }
  }

  const idsAnteriores = (anteriores ?? []).map((a) => a.id)
  if (idsAnteriores.length) {
    const { error } = await supabase.from('mapa_cotacao_itens').delete().in('id', idsAnteriores)
    if (error) return { erro: error.message }
  }

  revalidatePath(`/mapas/${mapaId}`)
}

// Aprovar grava as escolhas da tela e congela a decisão numa transação só
// (função aprovar_mapa): a cópia de cada oferta, a comparação inteira, o valor,
// quem aprovou e quando. Daí em diante o mapa só pode ser cancelado.
export async function aprovarMapa(mapaId: string, escolhas: unknown): Promise<Falha | void> {
  const supabase = await createClient()

  const { data: mapa, error } = await supabase
    .from('mapas_cotacao')
    .select('status, cotacoes_ids, pesos')
    .eq('id', mapaId)
    .single()
  if (error || !mapa) return { erro: 'Mapa não encontrado.' }
  if (mapa.status !== 'rascunho') return { erro: MSG_APROVADO }

  const validas = escolhasValidas(escolhas)
  if ('erro' in validas) return validas

  const pesos = (mapa.pesos as Pesos | null) ?? PESOS_PADRAO
  const grupos = await carregarGruposMapa(supabase, mapa.cotacoes_ids, pesos)
  const aprovacao = montarAprovacao(grupos, validas, pesos)
  if (!aprovacao.ok) return { erro: aprovacao.erros.join(' ') }

  const { error: erroAprovacao } = await supabase.rpc('aprovar_mapa', {
    p_mapa_id: mapaId,
    p_itens: aprovacao.itens as unknown as Json,
    p_comparacao: aprovacao.comparacao as unknown as Json,
    p_valor_total: aprovacao.valorTotal,
  })
  if (erroAprovacao) return { erro: erroAprovacao.message }

  revalidatePath(`/mapas/${mapaId}`)
  revalidatePath('/mapas')
  revalidatePath('/compras')
  revalidatePath('/dashboard')
}

// Compra que não vai acontecer sai do histórico, mas o mapa fica registrado
// como cancelado, com quem cancelou e por quê
export async function cancelarMapa(mapaId: string, motivo: string): Promise<Falha | void> {
  const texto = typeof motivo === 'string' ? motivo.trim().slice(0, LIMITE_MOTIVO) : ''
  if (!texto) return { erro: 'Informe o motivo do cancelamento.' }

  const supabase = await createClient()
  const status = await statusDoMapa(supabase, mapaId)
  if (typeof status !== 'string') return status
  if (status === 'rascunho') return { erro: 'Rascunho não precisa ser cancelado; exclua o mapa.' }
  if (status === 'cancelado') return { erro: 'Este mapa já foi cancelado.' }

  const { data: sessao } = await supabase.auth.getClaims()
  const { error } = await supabase
    .from('mapas_cotacao')
    .update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      cancelado_por: sessao?.claims?.email ?? 'não identificado',
      motivo_cancelamento: texto,
    })
    .eq('id', mapaId)
  if (error) return { erro: error.message }

  revalidatePath(`/mapas/${mapaId}`)
  revalidatePath('/mapas')
  revalidatePath('/compras')
  revalidatePath('/dashboard')
}

export async function excluirMapa(id: string): Promise<Falha | void> {
  const supabase = await createClient()
  const status = await statusDoMapa(supabase, id)
  if (typeof status !== 'string') return status
  if (status !== 'rascunho') {
    return { erro: 'Mapa aprovado não pode ser excluído. Cancele o mapa para tirá-lo do histórico de compras.' }
  }

  const { error } = await supabase.from('mapas_cotacao').delete().eq('id', id)
  if (error) return { erro: error.message }
  revalidatePath('/mapas')
}
