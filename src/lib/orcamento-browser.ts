import { createClient } from '@/lib/supabase/client'
import { enviarArquivoCotacao, extensaoDe } from '@/lib/supabase/upload'
import { linhasDaPagina } from './cotacao-propria'
import { unirPaginas, type OrcamentoLido } from './orcamento'

// Leitura do orçamento do fornecedor, conduzida pelo navegador página a página
// (como o OCR): cada chamada da Edge Function ler-orcamento fica bem abaixo do
// limite de tempo dela, e o comprador vê o andamento.

type Pagina = { texto: string } | { imagem: Blob; ext: string; tipo: string }
// etapa: em que página da leitura está (para a barra de progresso)
type Progresso = (mensagem: string, etapa?: { atual: number; total: number }) => void
// false quando o comprador cancelou: a leitura para na próxima página ou tentativa
type Continuar = () => boolean

class LeituraCancelada extends Error {
  constructor() {
    super('Leitura cancelada.')
  }
}

// Página de PDF com menos texto que isso é tratada como escaneada (vai como imagem)
const MIN_TEXTO_PAGINA = 80
// Planilha vira "páginas" de até tantas linhas, para nenhuma chamada ficar grande demais
const LINHAS_POR_PAGINA_PLANILHA = 70
const PASTA_PAGINAS = 'orcamento-paginas'
const ESCALA_PDF = 2
// Alta demanda da IA pode durar minutos: até 8 tentativas por página, com a
// espera crescendo (o comprador pode cancelar a leitura)
const MAX_TENTATIVAS = 8
const MAX_ESPERA_S = 90
// Quando a resposta não diz quanto esperar
const ESPERA_PADRAO_S: Record<number, number> = { 429: 60, 503: 20 }
// O worker da Edge Function foi trocado no meio da chamada (546) ou a
// plataforma não respondeu (502/504): é só repetir a página
const ESPERA_TROCA_S = 5
const STATUS_TROCA = new Set([502, 504, 546])
// Linhas do topo da primeira página usadas para reconhecer o fornecedor pelo nome
const LINHAS_CABECALHO = 25

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
    const corpo = (await resp?.json?.().catch(() => null)) as { error?: string; retry_after?: number } | null
    const status = resp?.status ?? 0
    if (STATUS_TROCA.has(status)) throw new ErroLeitura('A leitura desta página foi interrompida.', ESPERA_TROCA_S)
    if (status === 429 || status === 503) {
      // O tempo vem no corpo; o cabeçalho só é visível se a função o expuser
      const informado = Number(corpo?.retry_after ?? resp?.headers.get('Retry-After') ?? NaN)
      const espera = Number.isFinite(informado) && informado > 0 ? informado : ESPERA_PADRAO_S[status]
      throw new ErroLeitura(corpo?.error ?? error.message, espera)
    }
    throw new ErroLeitura(corpo?.error ?? error.message)
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
  continuar: Continuar = () => true,
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

    const etapa = { atual: n, total }
    const qual = total > 1 ? `a página ${n} de ${total}` : 'o orçamento'
    for (let tentativa = 1; ; tentativa++) {
      if (!continuar()) throw new LeituraCancelada()
      if (tentativa > 1) progresso?.(`Lendo ${qual} (tentativa ${tentativa} de ${MAX_TENTATIVAS})…`, etapa)
      try {
        return await chamarLeitura(corpo)
      } catch (e) {
        const pedida = e instanceof ErroLeitura ? e.esperarS : null
        if (pedida == null || pedida > MAX_ESPERA_S || tentativa >= MAX_TENTATIVAS) throw e
        // Com a IA sobrecarregada, cada nova tentativa espera um pouco mais
        const espera = Math.min(MAX_ESPERA_S, pedida + (tentativa - 1) * 5)
        progresso?.(`${(e as Error).message} Tentando ler ${qual} de novo em ${espera}s…`, etapa)
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
  continuar?: Continuar,
): Promise<OrcamentoLido & { paginas: number; textoCabecalho: string }> {
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
    progresso?.(paginas.length > 1 ? `Lendo a página ${i + 1} de ${paginas.length}…` : 'Lendo o orçamento…', {
      atual: i + 1,
      total: paginas.length,
    })
    respostas.push(await lerPagina(cotacaoPropriaId, pagina, i + 1, paginas.length, progresso, continuar))
  }
  const lido = unirPaginas(respostas)

  // O cabeçalho (onde o fornecedor se identifica) ajuda a reconhecê-lo pelo
  // nome: as primeiras linhas da primeira página com texto, mais o nome que a
  // leitura achou (único recurso em orçamento escaneado)
  const primeiraComTexto = paginas.find((p): p is { texto: string } => 'texto' in p)
  const textoCabecalho = [
    lido.cabecalho.fornecedor_nome,
    lido.cabecalho.fornecedor_razao_social,
    primeiraComTexto?.texto.split('\n').slice(0, LINHAS_CABECALHO).join('\n'),
  ]
    .filter(Boolean)
    .join('\n')

  return { ...lido, paginas: paginas.length, textoCabecalho }
}
