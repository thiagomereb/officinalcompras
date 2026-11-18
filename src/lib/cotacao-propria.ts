import { normalizarUnidade } from './unidades'

// Leitura do relatório "[90] Produtos para cotação" do sistema da farmácia, a
// cotação própria. O PDF sai do sistema com texto (não é imagem), então a
// leitura é exata e não passa por OCR: cada produto é uma linha
//
//   0000001004426  1004426 - 3 INDOL CARBINOL [100.0000 %]   12,0920 g
//   EAN            código  - nome             [teor]          quantidade unidade
//
// (nos produtos acabados vem ainda a fração C/V, "1/ 1", antes da quantidade)
// e o rodapé "TOTAL DE PRODUTOS: 307" confere se nenhuma linha ficou de fora.

export type ItemCotacaoPropria = {
  codigo: string
  ean: string | null
  nome: string
  teor: number | null
  quantidade: number
  unidade: string
  // Coluna OBSERVAÇÃO do relatório (ex.: "URGENTE")
  observacao?: string | null
}

export type CotacaoPropriaLida = {
  numero: string
  unidade: string | null
  // ISO com o fuso de Brasília, como o relatório imprime
  emitidaEm: string | null
  itens: ItemCotacaoPropria[]
  // O que a leitura ajustou e o comprador deve saber (produto repetido, teor impossível)
  avisos: string[]
}

export type LeituraCotacaoPropria = { ok: true; cotacao: CotacaoPropriaLida } | { ok: false; erro: string }

// EAN pode ter letras ("G60CS000354I") ou ser curto ("0047"); depois da
// unidade pode vir a coluna OBSERVAÇÃO ("URGENTE"). O nome é guloso para a
// quantidade ser a última da linha, não um número do nome ("1,5% WITANOLIDEOS").
const LINHA_ITEM =
  /^(SEM GTIN|[0-9A-Z]{1,14})\s+(\d{3,15})\s+-\s+(.+)\s+(\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+|\d+)\s+([A-Za-zµÁ-úçÇ.]+)(?:\s+(.+?))?$/
// Cara de linha de produto ("EAN código - nome"), para apontar a que não foi lida
const PARECE_PRODUTO = /^(?:SEM GTIN|\S+)\s+\d{3,15}\s+-\s/
const TEOR = /\s*\[(\d+(?:\.\d+)?)\s*%\]\s*$/
// Colchete do teor cortado pelo próprio relatório em nomes longos
const TEOR_CORTADO = /\s*\[[^\]]*$/
// Coluna FRAÇÃO C/V ("1/ 1", "0/ 0"): vazia nas matérias-primas, preenchida nos
// produtos acabados; colada no fim do nome quando ele é cortado ("OFFICINAL1/ 1")
const FRACAO = /\s*\d+\/\s+\d+$/

function numeroBR(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'))
}

// teorImpossivel: o teor como veio, quando passa de 100% (erro de digitação no
// sistema, ex.: "[50100.0000 %]"); o produto entra sem teor
function itemDaLinha(linha: string): { item: ItemCotacaoPropria; teorImpossivel: string | null } | null {
  const m = LINHA_ITEM.exec(linha)
  if (!m) return null
  const [, ean, codigo, nomeComTeor, quantidade, unidade, observacao] = m

  let nome = nomeComTeor.replace(FRACAO, '')
  let teor: number | null = null
  let teorImpossivel: string | null = null
  const t = TEOR.exec(nome)
  if (t) {
    teor = Number(t[1])
    nome = nome.slice(0, t.index)
    if (!(teor > 0 && teor <= 100)) {
      teorImpossivel = t[1]
      teor = null
    }
  } else {
    nome = nome.replace(TEOR_CORTADO, '')
  }

  return {
    item: {
      codigo,
      ean: ean === 'SEM GTIN' ? null : ean,
      nome: nome.trim(),
      teor,
      quantidade: numeroBR(quantidade),
      unidade: normalizarUnidade(unidade) ?? unidade,
      observacao: observacao?.trim() || null,
    },
    teorImpossivel,
  }
}

const quantidadeBR = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

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

  const lidos: ItemCotacaoPropria[] = []
  const naoLidas: string[] = []
  const avisos: string[] = []
  let totalDeclarado: number | null = null
  for (const linha of linhas) {
    const lido = itemDaLinha(linha)
    if (lido) {
      lidos.push(lido.item)
      if (lido.teorImpossivel) {
        avisos.push(`${lido.item.codigo} - ${lido.item.nome}: teor "${lido.teorImpossivel} %" no sistema; entra sem teor.`)
      }
      continue
    }
    const total = /TOTAL DE PRODUTOS:?\s*(\d+)/i.exec(linha)
    if (total) totalDeclarado = Number(total[1])
    else if (PARECE_PRODUTO.test(linha)) naoLidas.push(linha)
  }

  if (lidos.length === 0) return { ok: false, erro: 'Não encontrei nenhum produto no PDF.' }
  // O rodapé conta linhas: a conferência é antes de juntar os repetidos
  if (totalDeclarado != null && totalDeclarado !== lidos.length) {
    const quais = naoLidas.length
      ? ` Linha(s) que não consegui ler: ${naoLidas
          .slice(0, 5)
          .map((l) => `"${l.length > 100 ? `${l.slice(0, 100)}…` : l}"`)
          .join('; ')}${naoLidas.length > 5 ? ` e mais ${naoLidas.length - 5}` : ''}.`
      : ''
    return {
      ok: false,
      erro: `Li ${lidos.length} produto(s), mas o relatório diz ${totalDeclarado}.${quais}`,
    }
  }

  // O mesmo produto em mais de uma linha (pedidos somados no sistema): uma só
  // linha com a soma, se a unidade for a mesma
  const porCodigo = new Map<string, { item: ItemCotacaoPropria; partes: number[] }>()
  for (const item of lidos) {
    const atual = porCodigo.get(item.codigo)
    if (!atual) {
      porCodigo.set(item.codigo, { item: { ...item }, partes: [item.quantidade] })
      continue
    }
    if (atual.item.unidade !== item.unidade) {
      return {
        ok: false,
        erro: `O produto ${item.codigo} aparece mais de uma vez, em unidades diferentes (${atual.item.unidade} e ${item.unidade}).`,
      }
    }
    atual.partes.push(item.quantidade)
    atual.item.quantidade = Math.round((atual.item.quantidade + item.quantidade) * 10000) / 10000
    atual.item.observacao = [atual.item.observacao, item.observacao].filter(Boolean).join(' / ') || null
  }
  for (const { item, partes } of porCodigo.values()) {
    if (partes.length > 1) {
      avisos.push(
        `${item.codigo} - ${item.nome} aparece ${partes.length} vezes: quantidades somadas (${partes.map(quantidadeBR).join(' + ')} = ${quantidadeBR(item.quantidade)} ${item.unidade}).`,
      )
    }
  }

  return {
    ok: true,
    cotacao: {
      numero,
      unidade: primeiro(linhas, /SEGUINTE COTA[ÇC][ÃA]O PARA:\s*(.+)$/i),
      emitidaEm: emitidaEm(linhas),
      itens: [...porCodigo.values()].map((p) => p.item),
      avisos,
    },
  }
}

type PedacoTexto = { str: string; x: number; y: number }

// O pdfjs devolve o texto em pedaços soltos com posição; uma linha do relatório
// é o conjunto de pedaços na mesma altura, lidos da esquerda para a direita.
// Com separador " | ", as colunas ficam visíveis para quem lê (a IA, no orçamento).
export function linhasDaPagina(pedacos: PedacoTexto[], separador = ' '): string[] {
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
        .map((p) => p.str.trim().replace(/\s+/g, ' '))
        .join(separador),
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
