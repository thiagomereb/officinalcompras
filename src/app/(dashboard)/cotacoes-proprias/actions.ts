'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { removerArquivos } from '@/lib/supabase/storage'
import { mensagemErroBanco, type Falha } from '@/lib/acoes'
import type { ItemCotacaoPropria } from '@/lib/cotacao-propria'
import type { Json } from '@/types/database'

// Formato dos paths gerados por enviarArquivoCotacao (lib/supabase/upload.ts)
const PATH_PDF = /^\d+-[a-z0-9]+\.pdf$/
const LIMITE_ITENS = 3000

// A leitura do PDF acontece no navegador (lib/cotacao-propria.ts); o que chega
// aqui é conferido campo a campo em vez de confiar no tipo
function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null
}

function itensValidos(itens: unknown): ItemCotacaoPropria[] | Falha {
  if (!Array.isArray(itens) || itens.length === 0) return { erro: 'Nenhum produto na cotação.' }
  if (itens.length > LIMITE_ITENS) return { erro: `A cotação passa de ${LIMITE_ITENS} produtos.` }

  const codigos = new Set<string>()
  const validos: ItemCotacaoPropria[] = []
  for (const raw of itens) {
    const i = (raw ?? {}) as Record<string, unknown>
    const codigo = texto(i.codigo, 15)
    const nome = texto(i.nome, 300)
    const unidade = texto(i.unidade, 10)
    const ean = i.ean == null ? null : texto(i.ean, 14)
    const teor = i.teor == null ? null : Number(i.teor)
    const quantidade = Number(i.quantidade)

    if (!codigo || !/^\d+$/.test(codigo) || !nome || !unidade) return { erro: 'Produto inválido na cotação.' }
    if (i.ean != null && (!ean || !/^\d+$/.test(ean))) return { erro: `EAN inválido no produto ${codigo}.` }
    if (teor != null && !(teor >= 0 && teor <= 100)) return { erro: `Teor inválido no produto ${codigo}.` }
    if (!Number.isFinite(quantidade) || quantidade < 0) return { erro: `Quantidade inválida no produto ${codigo}.` }
    if (codigos.has(codigo)) return { erro: `O produto ${codigo} aparece duas vezes.` }
    codigos.add(codigo)

    validos.push({ codigo, ean, nome, teor, quantidade, unidade })
  }
  return validos
}

export async function importarCotacaoPropria(payload: unknown): Promise<Falha | void> {
  const p = (payload ?? {}) as Record<string, unknown>
  const numero = texto(p.numero, 20)
  const arquivoUrl = texto(p.arquivoUrl, 100)
  const arquivoNome = texto(p.arquivoNome, 255)
  const emitidaEm = p.emitidaEm == null ? null : texto(p.emitidaEm, 40)

  if (!numero || !/^\d+$/.test(numero)) return { erro: 'Número da cotação inválido.' }
  if (!arquivoUrl || !PATH_PDF.test(arquivoUrl)) return { erro: 'Arquivo da cotação inválido.' }
  if (p.emitidaEm != null && (!emitidaEm || Number.isNaN(Date.parse(emitidaEm)))) return { erro: 'Data de emissão inválida.' }

  const itens = itensValidos(p.itens)
  if ('erro' in itens) return itens

  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('importar_cotacao_propria', {
    p_cotacao: {
      numero,
      unidade: texto(p.unidade, 200),
      emitida_em: emitidaEm,
      arquivo_url: arquivoUrl,
      arquivo_nome: arquivoNome,
    } as Json,
    p_itens: itens as unknown as Json,
  })
  if (error) return { erro: mensagemErroBanco(error, { duplicado: `A cotação ${numero} já foi importada.` }) }

  revalidatePath('/cotacoes-proprias')
  revalidatePath('/insumos', 'layout')
  redirect(`/cotacoes-proprias/${id}`)
}

export async function excluirCotacaoPropria(id: string): Promise<Falha | void> {
  const supabase = await createClient()

  // Mapa em rascunho vai junto; aprovado ou cancelado é registro de compra
  const { count: mapasFechados } = await supabase
    .from('mapas_cotacao')
    .select('id', { count: 'exact', head: true })
    .eq('cotacao_propria_id', id)
    .neq('status', 'rascunho')
  if (mapasFechados) {
    return { erro: 'Esta cotação tem mapa aprovado ou cancelado, que fica no histórico de compras. Ela não pode ser excluída.' }
  }

  const { data: cotacao } = await supabase.from('cotacoes_proprias').select('arquivo_url').eq('id', id).single()
  const { error } = await supabase.from('cotacoes_proprias').delete().eq('id', id)
  if (error) return { erro: error.message }

  await removerArquivos(supabase, [cotacao?.arquivo_url ?? null])
  revalidatePath('/cotacoes-proprias')
  revalidatePath('/mapas')
}
