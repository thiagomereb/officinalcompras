import { createClient } from '@/lib/supabase/client'
import { salvarItensExtraidos } from '@/app/(dashboard)/cotacoes/actions'
import type { ItemExtraido, PreparoExtracao } from './ocr'

// O OCR é chamado do navegador, e não de uma Server Action, de propósito: as
// Netlify Functions têm limite fixo de 60s e o Gemini costuma passar disso em
// tabelas densas, o que fazia a requisição morrer com 504. Aqui o único teto é
// o da própria Edge Function do Supabase.
async function extrairItensOCR(arquivoUrl: string, arquivoNome: string): Promise<ItemExtraido[]> {
  const supabase = createClient()

  const { data, error } = await supabase.functions.invoke('ocr-extrair', {
    body: { arquivo_url: arquivoUrl, arquivo_nome: arquivoNome },
  })

  if (error) {
    const body = (await (error as { context?: Response }).context?.json?.().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(body?.error ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
  if (!Array.isArray(data?.itens)) throw new Error('Resposta inesperada da Edge Function.')

  return data.itens as ItemExtraido[]
}

// Fecha o ciclo iniciado por prepararExtracao/uploadArquivo: roda o OCR quando
// necessário e grava os itens. Devolve quantos itens entraram na cotação.
export async function concluirExtracao(
  cotacaoId: string,
  preparo: PreparoExtracao,
): Promise<number> {
  if (preparo.modo === 'concluido') return preparo.count

  const itens = await extrairItensOCR(preparo.signedUrl, preparo.arquivoNome)
  const { count } = await salvarItensExtraidos(cotacaoId, itens)
  return count
}
