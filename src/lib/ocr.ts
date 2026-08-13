import { createClient } from '@/lib/supabase/server'

export type ItemExtraido = {
  descricao: string
  preco_unitario: number
  quantidade_embalagem: number | null
  quantidade: number | null
  unidade: string | null
  pais_origem: string | null
  ipi: number | null
  st: number | null
  validade: string | null
  cas: string | null
}

export async function extrairItensOCR(arquivoUrl: string, arquivoNome: string): Promise<ItemExtraido[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.functions.invoke('ocr-extrair', {
    body: { arquivo_url: arquivoUrl, arquivo_nome: arquivoNome },
  })

  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? error.message)
  }
  if (data?.error) throw new Error(data.error)
  if (!Array.isArray(data?.itens)) throw new Error('Resposta inesperada da Edge Function.')

  return data.itens as ItemExtraido[]
}
