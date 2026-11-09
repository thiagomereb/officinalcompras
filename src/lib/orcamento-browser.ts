import { createClient } from '@/lib/supabase/client'
import { enviarArquivoCotacao, extensaoDe } from '@/lib/supabase/upload'
import { linhasDaPagina } from './cotacao-propria'
import { unirPaginas, type OrcamentoLido } from './orcamento'

// Leitura do orçamento do fornecedor, conduzida pelo navegador página a página
// (como o OCR): cada chamada da Edge Function ler-orcamento fica bem abaixo do
// limite de tempo dela, e o comprador vê o andamento.

type Pagina = { texto: string } | { imagem: Blob; ext: string; tipo: string }
type Progresso = (mensagem: string) => void

// Página de PDF com menos texto que isso é tratada como escaneada (vai como imagem)
const MIN_TEXTO_PAGINA = 80
// Planilha vira "páginas" de até tantas linhas, para nenhuma chamada ficar grande demais
const LINHAS_POR_PAGINA_PLANILHA = 70
const PASTA_PAGINAS = 'orcamento-paginas'
const ESCALA_PDF = 2
const MAX_TENTATIVAS = 4
const MAX_ESPERA_S = 90

async function paginasDoPdf(dados: ArrayBuffer): Promise<Pagina[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const tarefa = pdfjsLib.getDocument({ data: dados })
  try {
    const pdf = await tarefa.promise
    const paginas: Pagina[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n)
      const { items } = await pagina.getTextContent()
      const texto = linhasDaPagina(
        items.flatMap((i) => ('str' in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : [])),
        ' | ',
      ).join('\n')

      if (texto.replace(/\s/g, '').length >= MIN_TEXTO_PAGINA) {
        paginas.push({ texto })
        continue
      }
      // Escaneada: vai a imagem da página
      const viewport = pagina.getViewport({ scale: ESCALA_PDF })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await pagina.render({ canvas, viewport }).promise
      const imagem = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.9))
      if (!imagem) throw new Error(`Não foi possível converter a página ${n} do PDF.`)
      paginas.push({ imagem, ext: 'jpg', tipo: 'image/jpeg' })
    }
    return paginas
  } finally {
    await tarefa.destroy()
  }
}

async function paginasDaPlanilha(dados: ArrayBuffer): Promise<Pagina[]> {
  const XLSX = await import('xlsx')
  const livro = XLSX.read(dados, { type: 'array', cellDates: true })
  const linhas = livro.SheetNames.flatMap((nome) =>
    XLSX.utils
      .sheet_to_json<unknown[]>(livro.Sheets[nome], { header: 1, defval: '', raw: false })
      .map((linha) => linha.map((c) => String(c ?? '').trim()).filter(Boolean).join(' | '))
      .filter(Boolean),
  )
  const paginas: Pagina[] = []
  for (let i = 0; i < linhas.length; i += LINHAS_POR_PAGINA_PLANILHA) {
    paginas.push({ texto: linhas.slice(i, i + LINHAS_POR_PAGINA_PLANILHA).join('\n') })
  }
  return paginas
}

class ErroLeitura extends Error {
  constructor(message: string, readonly esperarS: number | null = null) {
    super(message)
  }
}

async function chamarLeitura(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await createClient().functions.invoke('ler-orcamento', { body })
  if (error) {
    const resp = (error as { context?: Response }).context
    const corpo = (await resp?.json?.().catch(() => null)) as { error?: string } | null
    const status = resp?.status
    const espera = status === 429 || status === 503 ? Number(resp?.headers.get('Retry-After')) : NaN
    throw new ErroLeitura(corpo?.error ?? error.message, Number.isFinite(espera) ? espera : null)
  }
  if (data?.error) throw new ErroLeitura(data.error)
  return data as Record<string, unknown>
}

async function lerPagina(
  cotacaoPropriaId: string,
  pagina: Pagina,
  n: number,
  total: number,
  progresso?: Progresso,
): Promise<Record<string, unknown>> {
  const supabase = createClient()
  let temporario: string | null = null
  const corpo: Record<string, unknown> = { cotacao_propria_id: cotacaoPropriaId, pagina: n, total_paginas: total }

  try {
    if ('texto' in pagina) {
      corpo.texto = pagina.texto
    } else {
      temporario = await enviarArquivoCotacao(pagina.imagem, `pagina-${n}.${pagina.ext}`, PASTA_PAGINAS)
      const { data } = await supabase.storage.from('cotacoes').createSignedUrl(temporario, 600)
      if (!data?.signedUrl) throw new Error(`Não foi possível preparar a página ${n}.`)
      corpo.imagem_url = data.signedUrl
      corpo.imagem_tipo = pagina.tipo
    }

    for (let tentativa = 1; ; tentativa++) {
      try {
        return await chamarLeitura(corpo)
      } catch (e) {
        const espera = e instanceof ErroLeitura ? e.esperarS : null
        if (espera == null || espera > MAX_ESPERA_S || tentativa >= MAX_TENTATIVAS) throw e
        progresso?.(`${(e as Error).message} Aguardando ${espera}s…`)
        await new Promise((ok) => setTimeout(ok, espera * 1000))
      }
    }
  } finally {
    if (temporario) await supabase.storage.from('cotacoes').remove([temporario])
  }
}

export async function lerOrcamento(
  arquivo: File,
  cotacaoPropriaId: string,
  progresso?: Progresso,
): Promise<OrcamentoLido & { paginas: number }> {
  const ext = extensaoDe(arquivo.name)
  progresso?.('Abrindo o arquivo…')
  const dados = await arquivo.arrayBuffer()

  let paginas: Pagina[]
  if (ext === 'pdf') paginas = await paginasDoPdf(dados)
  else if (ext === 'xlsx' || ext === 'xls') paginas = await paginasDaPlanilha(dados)
  else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    paginas = [{ imagem: arquivo, ext, tipo: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' }]
  }
  else throw new Error('Envie o orçamento em PDF, planilha (XLSX/XLS) ou imagem.')
  if (paginas.length === 0) throw new Error('O arquivo está vazio.')

  const respostas: Record<string, unknown>[] = []
  for (const [i, pagina] of paginas.entries()) {
    progresso?.(paginas.length > 1 ? `Lendo a página ${i + 1} de ${paginas.length}…` : 'Lendo o orçamento…')
    respostas.push(await lerPagina(cotacaoPropriaId, pagina, i + 1, paginas.length, progresso))
  }
  return { ...unirPaginas(respostas), paginas: paginas.length }
}
