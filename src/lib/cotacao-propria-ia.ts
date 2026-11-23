import { createClient } from './supabase/client'
import { conferirLeituraIa, type ItemLidoPelaIa, type LinhaNaoLida } from './cotacao-propria'

// Linhas da cotação própria que o padrão não leu vão para a IA (Edge Function
// ler-linhas-cotacao), em lotes. Cada resposta é conferida contra o texto da
// linha antes de valer (conferirLeituraIa).

const POR_CHAMADA = 40
// Mais que isso fora do padrão é o formato do relatório que mudou: a IA não
// é o caminho, e sim ajustar a leitura
export const MAX_LINHAS_IA = 120
const TENTATIVAS = 3
const ESPERA_MAXIMA_S = 30
const STATUS_TENTAR_DE_NOVO = new Set([429, 502, 503, 504, 546])

async function chamar(lote: LinhaNaoLida[], aviso?: (texto: string) => void): Promise<unknown[]> {
  for (let tentativa = 1; ; tentativa++) {
    const { data, error } = await createClient().functions.invoke('ler-linhas-cotacao', { body: { linhas: lote } })
    if (!error) {
      if (data?.error) throw new Error(data.error)
      return Array.isArray(data?.itens) ? data.itens : []
    }
    const resp = (error as { context?: Response }).context
    const corpo = (await resp?.json?.().catch(() => null)) as { error?: string; retry_after?: number } | null
    const status = resp?.status ?? 0
    if (!STATUS_TENTAR_DE_NOVO.has(status) || tentativa >= TENTATIVAS) throw new Error(corpo?.error ?? error.message)
    const informado = Number(corpo?.retry_after)
    const espera = Math.min(Number.isFinite(informado) && informado > 0 ? informado : 10, ESPERA_MAXIMA_S)
    aviso?.(`${corpo?.error ?? 'A IA está ocupada.'} Tentando de novo em ${espera}s…`)
    await new Promise((r) => setTimeout(r, espera * 1000))
  }
}

// Devolve só as linhas cuja leitura conferiu; as outras continuam sem leitura
export async function lerLinhasComIa(linhas: LinhaNaoLida[], aviso?: (texto: string) => void): Promise<ItemLidoPelaIa[]> {
  const lidos: ItemLidoPelaIa[] = []
  for (let i = 0; i < linhas.length; i += POR_CHAMADA) {
    const lote = linhas.slice(i, i + POR_CHAMADA)
    if (linhas.length > POR_CHAMADA) aviso?.(`Lendo pela IA as linhas ${i + 1} a ${i + lote.length} de ${linhas.length}…`)
    const respostas = await chamar(lote, aviso)
    const usadas = new Set<number>()
    for (const r of respostas) {
      const x = (r ?? {}) as Record<string, unknown>
      const indice = Number(x.indice)
      if (x.ok !== true || !Number.isInteger(indice) || indice < 0 || indice >= lote.length || usadas.has(indice)) continue
      const conferido = conferirLeituraIa(lote[indice], x)
      if (!conferido) continue
      usadas.add(indice)
      lidos.push(conferido)
    }
  }
  return lidos
}
