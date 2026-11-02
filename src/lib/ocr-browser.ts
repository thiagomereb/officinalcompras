import { createClient } from '@/lib/supabase/client'
import { enviarArquivoCotacao, extensaoDe } from '@/lib/supabase/upload'
import { salvarItensExtraidos } from '@/app/(dashboard)/cotacoes/actions'
import { ehFalha } from './acoes'
import type { ItemExtraido, PreparoExtracao } from './ocr'

// Páginas de PDF convertidas para imagem ficam aqui só durante o OCR
const PASTA_PAGINAS = 'ocr-paginas'
// A Edge Function recusa imagens acima de 5 MB; JPEG mantém a página bem abaixo
// disso mesmo em escala 2, que é o que deixa o texto legível para o modelo.
const ESCALA_PDF = 2
const QUALIDADE_JPEG = 0.9
// Espera máxima aceita para tentar de novo após o limite por minuto da Edge Function
const MAX_ESPERA_RATE_LIMIT_S = 90

type Progresso = (mensagem: string) => void

class ErroOcr extends Error {
  constructor(message: string, readonly retryAfterS: number | null = null) {
    super(message)
  }
}

// O OCR é chamado do navegador, e não de uma Server Action, de propósito: as
// Netlify Functions têm limite fixo de 60s e o Gemini costuma passar disso em
// tabelas densas, o que fazia a requisição morrer com 504. Aqui o único teto é
// o da própria Edge Function do Supabase.
async function chamarOcr(arquivoUrl: string, arquivoNome: string): Promise<ItemExtraido[]> {
  const supabase = createClient()

  const { data, error } = await supabase.functions.invoke('ocr-extrair', {
    body: { arquivo_url: arquivoUrl, arquivo_nome: arquivoNome },
  })

  if (error) {
    const resp = (error as { context?: Response }).context
    const body = (await resp?.json?.().catch(() => null)) as { error?: string } | null
    const retryAfter = resp?.status === 429 ? Number(resp.headers.get('Retry-After')) : NaN
    throw new ErroOcr(body?.error ?? error.message, Number.isFinite(retryAfter) ? retryAfter : null)
  }
  if (data?.error) throw new ErroOcr(data.error)
  if (!Array.isArray(data?.itens)) throw new ErroOcr('Resposta inesperada da Edge Function.')

  return data.itens as ItemExtraido[]
}

// PDFs grandes passam do limite de requisições por minuto da Edge Function;
// em vez de perder as páginas já lidas, espera a janela abrir e segue.
async function extrairItensOCR(arquivoUrl: string, arquivoNome: string, progresso?: Progresso): Promise<ItemExtraido[]> {
  try {
    return await chamarOcr(arquivoUrl, arquivoNome)
  } catch (err) {
    const espera = err instanceof ErroOcr ? err.retryAfterS : null
    if (espera == null || espera > MAX_ESPERA_RATE_LIMIT_S) throw err
    progresso?.(`Limite por minuto atingido, aguardando ${espera}s...`)
    await new Promise((r) => setTimeout(r, espera * 1000))
    return chamarOcr(arquivoUrl, arquivoNome)
  }
}

async function pdfParaImagens(pdfData: ArrayBuffer): Promise<Blob[]> {
  const pdfjsLib = await import('pdfjs-dist')
  // Precisa ser da mesma versão do pacote: o postinstall copia o worker para /public
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  // No pdfjs 6 quem libera worker e memória é a loading task, não o documento
  const tarefa = pdfjsLib.getDocument({ data: pdfData })
  const pdf = await tarefa.promise
  try {
    const imagens: Blob[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: ESCALA_PDF })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG))
      if (!blob) throw new Error(`Não foi possível converter a página ${i} do PDF.`)
      imagens.push(blob)
    }
    return imagens
  } finally {
    await tarefa.destroy()
  }
}

async function extrairItensPdf(path: string, progresso?: Progresso): Promise<ItemExtraido[]> {
  const supabase = createClient()

  progresso?.('Convertendo PDF...')
  const { data: pdfBlob, error } = await supabase.storage.from('cotacoes').download(path)
  if (error || !pdfBlob) throw new Error(`Não foi possível baixar o PDF: ${error?.message ?? 'arquivo vazio'}`)
  const paginas = await pdfParaImagens(await pdfBlob.arrayBuffer())

  const temporarios: string[] = []
  try {
    const itens: ItemExtraido[] = []
    for (const [i, pagina] of paginas.entries()) {
      progresso?.(paginas.length > 1 ? `Extraindo página ${i + 1} de ${paginas.length}...` : 'Extraindo com IA...')
      const nome = `pagina-${i + 1}.jpg`
      const pathPagina = await enviarArquivoCotacao(pagina, nome, PASTA_PAGINAS)
      temporarios.push(pathPagina)

      const { data: assinada } = await supabase.storage.from('cotacoes').createSignedUrl(pathPagina, 600)
      if (!assinada?.signedUrl) throw new Error(`Não foi possível acessar a página ${i + 1} enviada.`)

      try {
        itens.push(...(await extrairItensOCR(assinada.signedUrl, nome, progresso)))
      } catch (err) {
        throw new Error(`Página ${i + 1}: ${(err as Error).message}`)
      }
    }
    return itens
  } finally {
    if (temporarios.length) await supabase.storage.from('cotacoes').remove(temporarios)
  }
}

// Fecha o ciclo iniciado por prepararExtracao/anexarArquivo: roda o OCR quando
// necessário e grava os itens. Um PDF de várias páginas é gravado de uma vez só
// no fim, então uma falha no meio não deixa a cotação pela metade.
export async function concluirExtracao(
  cotacaoId: string,
  preparo: PreparoExtracao,
  opcoes: { substituir: boolean; progresso?: Progresso },
): Promise<number> {
  if (preparo.modo === 'concluido') return preparo.count

  const itens =
    extensaoDe(preparo.path) === 'pdf'
      ? await extrairItensPdf(preparo.path, opcoes.progresso)
      : await extrairItensOCR(preparo.signedUrl, preparo.path, opcoes.progresso)

  const resultado = await salvarItensExtraidos(cotacaoId, itens, opcoes.substituir)
  if (ehFalha(resultado)) throw new Error(resultado.erro)
  return resultado.count
}
