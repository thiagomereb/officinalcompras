import { normalizarUnidade } from './unidades'

// Leitura do relatório "[90] Produtos para cotação" do sistema da farmácia, a
// cotação própria. O PDF sai do sistema com texto (não é imagem), então a
// leitura é exata e não passa por OCR: cada produto é uma linha
//
//   0000001004426  1004426 - 3 INDOL CARBINOL [100.0000 %]   12,0920 g
//   EAN            código  - nome             [teor]          quantidade unidade
//
// e o rodapé "TOTAL DE PRODUTOS: 307" confere se nenhuma linha ficou de fora.

export type ItemCotacaoPropria = {
  codigo: string
  ean: string | null
  nome: string
  teor: number | null
  quantidade: number
  unidade: string
}

export type CotacaoPropriaLida = {
  numero: string
  unidade: string | null
  // ISO com o fuso de Brasília, como o relatório imprime
  emitidaEm: string | null
  itens: ItemCotacaoPropria[]
}

export type LeituraCotacaoPropria = { ok: true; cotacao: CotacaoPropriaLida } | { ok: false; erro: string }

const LINHA_ITEM = /^(SEM GTIN|\d{8,14})\s+(\d{3,15})\s+-\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+|\d+)\s+([A-Za-zµÁ-úçÇ.]+)$/
const TEOR = /\s*\[(\d+(?:\.\d+)?)\s*%\]\s*$/
// Colchete do teor cortado pelo próprio relatório em nomes longos
const TEOR_CORTADO = /\s*\[[^\]]*$/

function numeroBR(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'))
}

function itemDaLinha(linha: string): ItemCotacaoPropria | null {
  const m = LINHA_ITEM.exec(linha)
  if (!m) return null
  const [, ean, codigo, nomeComTeor, quantidade, unidade] = m

  let nome = nomeComTeor
  let teor: number | null = null
  const t = TEOR.exec(nome)
  if (t) {
    teor = Number(t[1])
    nome = nome.slice(0, t.index)
  } else {
    nome = nome.replace(TEOR_CORTADO, '')
  }

  return {
    codigo,
    ean: ean === 'SEM GTIN' ? null : ean,
    nome: nome.trim(),
    teor,
    quantidade: numeroBR(quantidade),
    unidade: normalizarUnidade(unidade) ?? unidade,
  }
}

function emitidaEm(linhas: string[]): string | null {
  for (const l of linhas) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(l)
    if (m) {
      const [, dia, mes, ano, h, min, s] = m
      return `${ano}-${mes}-${dia}T${h}:${min}:${s}-03:00`
    }
  }
  return null
}

function primeiro(linhas: string[], re: RegExp): string | null {
  for (const l of linhas) {
    const m = re.exec(l)
    if (m) return m[1].trim()
  }
  return null
}

export function lerCotacaoPropria(linhas: string[]): LeituraCotacaoPropria {
  if (!linhas.some((l) => /PRODUTOS PARA COTA[ÇC]/i.test(l))) {
    return { ok: false, erro: 'Este PDF não parece o relatório "Produtos para cotação" do sistema da farmácia.' }
  }

  const numero = primeiro(linhas, /COTA[ÇC][ÃA]O:\s*(\d+)/i)
  if (!numero) return { ok: false, erro: 'Não encontrei o número da cotação ("COTAÇÃO: ...") no PDF.' }

  const itens: ItemCotacaoPropria[] = []
  let totalDeclarado: number | null = null
  for (const linha of linhas) {
    const item = itemDaLinha(linha)
    if (item) {
      itens.push(item)
      continue
    }
    const total = /TOTAL DE PRODUTOS:?\s*(\d+)/i.exec(linha)
    if (total) totalDeclarado = Number(total[1])
  }

  if (itens.length === 0) return { ok: false, erro: 'Não encontrei nenhum produto no PDF.' }
  if (totalDeclarado != null && totalDeclarado !== itens.length) {
    return {
      ok: false,
      erro: `Li ${itens.length} produto(s), mas o relatório diz ${totalDeclarado}. Gere o PDF de novo no sistema e tente outra vez.`,
    }
  }

  const vistos = new Set<string>()
  for (const item of itens) {
    if (vistos.has(item.codigo)) return { ok: false, erro: `O produto ${item.codigo} aparece duas vezes no relatório.` }
    vistos.add(item.codigo)
  }

  return {
    ok: true,
    cotacao: {
      numero,
      unidade: primeiro(linhas, /SEGUINTE COTA[ÇC][ÃA]O PARA:\s*(.+)$/i),
      emitidaEm: emitidaEm(linhas),
      itens,
    },
  }
}

type PedacoTexto = { str: string; x: number; y: number }

// O pdfjs devolve o texto em pedaços soltos com posição; uma linha do relatório
// é o conjunto de pedaços na mesma altura, lidos da esquerda para a direita
export function linhasDaPagina(pedacos: PedacoTexto[]): string[] {
  const linhas: { y: number; pedacos: PedacoTexto[] }[] = []
  for (const p of pedacos) {
    if (!p.str.trim()) continue
    let linha = linhas.find((l) => Math.abs(l.y - p.y) < 2.5)
    if (!linha) linhas.push((linha = { y: p.y, pedacos: [] }))
    linha.pedacos.push(p)
  }
  return linhas
    .sort((a, b) => b.y - a.y)
    .map((l) =>
      l.pedacos
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str.trim())
        .join(' ')
        .replace(/\s+/g, ' '),
    )
}

// Só no navegador: lê o texto de todas as páginas do PDF
export async function linhasDoPdf(dados: ArrayBuffer): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist')
  // Precisa ser da mesma versão do pacote: o postinstall copia o worker para /public
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const tarefa = pdfjsLib.getDocument({ data: dados })
  try {
    const pdf = await tarefa.promise
    const linhas: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n)
      const { items } = await pagina.getTextContent()
      linhas.push(
        ...linhasDaPagina(
          items.flatMap((i) => ('str' in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : [])),
        ),
      )
    }
    return linhas
  } finally {
    await tarefa.destroy()
  }
}
