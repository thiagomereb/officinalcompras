import { ehUnidadeQuantidade, normalizarUnidade } from './unidades'

// Leitura do relatório "[90] Produtos para cotação" do sistema da farmácia, a
// cotação própria. O PDF sai do sistema com texto (não é imagem), então a
// leitura é exata e não passa por OCR: cada produto é uma linha
//
//   0000001004426  1004426 - 3 INDOL CARBINOL [100.0000 %]   12,0920 g
//   EAN            código  - nome             [teor]          quantidade unidade
//
// (nos produtos acabados vem ainda a fração C/V, "1/ 1", antes da quantidade)
// e o rodapé "TOTAL DE PRODUTOS: 307" confere se nenhuma linha ficou de fora.
//
// Linha com cara de produto num formato que o padrão não reconhece vai para a
// IA (lib/cotacao-propria-ia.ts), só ela. O que a IA devolve é conferido contra
// o texto da linha (conferirLeituraIa): código, quantidade e unidade precisam
// estar escritos ali, então a IA não inventa produto nem quantidade.

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
  // O que a leitura ajustou e o comprador deve saber (teor impossível, linha não lida)
  avisos: string[]
  // Produtos que a IA leu, com a linha de onde vieram, para o comprador conferir
  lidosPelaIa: { item: ItemCotacaoPropria; linha: string }[]
}

export type LeituraCotacaoPropria = { ok: true; cotacao: CotacaoPropriaLida } | { ok: false; erro: string }

// Linha com cara de produto que o padrão não leu. continuacao: a linha logo
// abaixo, quando não é outro produto (nome longo que quebrou, por exemplo)
export type LinhaNaoLida = { texto: string; continuacao: string | null }

// A primeira etapa da leitura: o que o padrão leu e o que sobrou, na ordem do PDF
export type LeituraParcial = {
  numero: string
  unidade: string | null
  emitidaEm: string | null
  linhas: ({ item: ItemCotacaoPropria } | { naoLida: LinhaNaoLida })[]
  avisos: string[]
  totalDeclarado: number | null
}

// Produto que a IA leu de uma linha, já conferido contra o texto dela
export type ItemLidoPelaIa = { linha: LinhaNaoLida; item: ItemCotacaoPropria; teorImpossivel: string | null }

// EAN pode ter letras ("G60CS000354I") ou ser curto ("0047"); depois da
// unidade pode vir a coluna OBSERVAÇÃO ("URGENTE"). O nome é guloso para a
// quantidade ser a última da linha, não um número do nome ("1,5% WITANOLIDEOS").
const LINHA_ITEM =
  /^(SEM GTIN|[0-9A-Z]{1,14})\s+(\d{3,15})\s+-\s+(.+)\s+(\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+|\d+)\s+([A-Za-zµÁ-úçÇ.]+)(?:\s+(.+?))?$/
// Cara de linha de produto, para mandar à IA ou apontar a que não foi lida:
// "EAN código..." (com ou sem o hífen) ou "código - nome" (sem o EAN)
const PARECE_PRODUTO = /^(?:(?:SEM GTIN|[0-9A-Z]{1,14})\s+\d{3,15}(?=\s|-|$)|\d{3,15}\s+-\s)/
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

const avisoTeor = (item: ItemCotacaoPropria, teor: string) =>
  `${item.codigo} - ${item.nome}: teor "${teor} %" no sistema; entra sem teor.`

const TOTAL_PRODUTOS = /TOTAL DE PRODUTOS:?\s*(\d+)/i

// Primeira etapa: o cabeçalho, os produtos que o padrão lê e as linhas com cara
// de produto que ele não leu
export function lerLinhasCotacaoPropria(linhas: string[]): { ok: true; parcial: LeituraParcial } | { ok: false; erro: string } {
  if (!linhas.some((l) => /PRODUTOS PARA COTA[ÇC]/i.test(l))) {
    return { ok: false, erro: 'Este PDF não parece o relatório "Produtos para cotação" do sistema da farmácia.' }
  }

  const numero = primeiro(linhas, /COTA[ÇC][ÃA]O:\s*(\d+)/i)
  if (!numero) return { ok: false, erro: 'Não encontrei o número da cotação ("COTAÇÃO: ...") no PDF.' }

  const lidas: LeituraParcial['linhas'] = []
  const avisos: string[] = []
  let totalDeclarado: number | null = null
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const lido = itemDaLinha(linha)
    if (lido) {
      lidas.push({ item: lido.item })
      if (lido.teorImpossivel) avisos.push(avisoTeor(lido.item, lido.teorImpossivel))
      continue
    }
    const total = TOTAL_PRODUTOS.exec(linha)
    if (total) {
      totalDeclarado = Number(total[1])
    } else if (PARECE_PRODUTO.test(linha)) {
      const seguinte = linhas[i + 1]
      const continua = seguinte != null && !PARECE_PRODUTO.test(seguinte) && !TOTAL_PRODUTOS.test(seguinte)
      lidas.push({ naoLida: { texto: linha, continuacao: continua ? seguinte : null } })
    }
  }

  if (lidas.length === 0) return { ok: false, erro: 'Não encontrei nenhum produto no PDF.' }
  return {
    ok: true,
    parcial: {
      numero,
      unidade: primeiro(linhas, /SEGUINTE COTA[ÇC][ÃA]O PARA:\s*(.+)$/i),
      emitidaEm: emitidaEm(linhas),
      linhas: lidas,
      avisos,
      totalDeclarado,
    },
  }
}

// As linhas que vão para a IA: as que sobraram quando falta produto para fechar
// com o rodapé (ou quando o relatório não tem rodapé). Quando o total já
// fecha, o que sobrou não é produto.
export function linhasParaIa(parcial: LeituraParcial): LinhaNaoLida[] {
  const naoLidas = parcial.linhas.flatMap((l) => ('naoLida' in l ? [l.naoLida] : []))
  const lidos = parcial.linhas.length - naoLidas.length
  return parcial.totalDeclarado == null || lidos < parcial.totalDeclarado ? naoLidas : []
}

const listarLinhas = (linhas: LinhaNaoLida[]) =>
  `${linhas
    .slice(0, 5)
    .map(({ texto: l }) => `"${l.length > 100 ? `${l.slice(0, 100)}…` : l}"`)
    .join('; ')}${linhas.length > 5 ? ` e mais ${linhas.length - 5}` : ''}`

// Segunda etapa: junta o que a IA leu (na posição da linha no PDF) e confere
// com o rodapé. erroIa: por que a IA não leu, se falhou.
export function concluirCotacaoPropria(
  parcial: LeituraParcial,
  pelaIa: ItemLidoPelaIa[] = [],
  erroIa?: string,
): LeituraCotacaoPropria {
  const daIa = new Map(pelaIa.map((x) => [x.linha, x]))
  const lidos: ItemCotacaoPropria[] = []
  const naoLidas: LinhaNaoLida[] = []
  const avisos = [...parcial.avisos]
  const lidosPelaIa: CotacaoPropriaLida['lidosPelaIa'] = []
  for (const l of parcial.linhas) {
    if ('item' in l) {
      lidos.push(l.item)
      continue
    }
    const ia = daIa.get(l.naoLida)
    if (!ia) {
      naoLidas.push(l.naoLida)
      continue
    }
    lidos.push(ia.item)
    lidosPelaIa.push({ item: ia.item, linha: l.naoLida.texto })
    if (ia.teorImpossivel) avisos.push(avisoTeor(ia.item, ia.teorImpossivel))
  }

  const { totalDeclarado } = parcial
  const porqueIa = erroIa ? ` A leitura dessas linhas pela IA também falhou: ${erroIa}` : ''
  if (lidos.length === 0) return { ok: false, erro: `Não encontrei nenhum produto no PDF.${porqueIa}` }
  // O rodapé conta linhas, inclusive as do mesmo produto
  if (totalDeclarado != null && totalDeclarado !== lidos.length) {
    const quais = naoLidas.length ? ` Linha(s) que não consegui ler: ${listarLinhas(naoLidas)}.` : ''
    return {
      ok: false,
      erro: `Li ${lidos.length} produto(s), mas o relatório diz ${totalDeclarado}.${quais}${naoLidas.length ? porqueIa : ''}`,
    }
  }
  // Sem rodapé não há como saber se eram produtos: entra o que foi lido, com aviso
  if (totalDeclarado == null && naoLidas.length) {
    avisos.push(`${naoLidas.length} linha(s) parecem produto e não foram lidas: ${listarLinhas(naoLidas)}.`)
  }

  // A cotação fica exatamente como o relatório: o mesmo produto em mais de uma
  // linha continua em linhas separadas (quem pediu separou por algum motivo)
  return {
    ok: true,
    cotacao: {
      numero: parcial.numero,
      unidade: parcial.unidade,
      emitidaEm: parcial.emitidaEm,
      itens: lidos,
      avisos,
      lidosPelaIa,
    },
  }
}

// A leitura só pelo padrão, sem IA
export function lerCotacaoPropria(linhas: string[]): LeituraCotacaoPropria {
  const r = lerLinhasCotacaoPropria(linhas)
  return r.ok ? concluirCotacaoPropria(r.parcial) : r
}

// Número escrito na linha com a unidade logo depois ("1.000,0000 u", "12,0920g")
// ou logo antes ("g 500,0000")
const NUMERO_BR = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`
const UNIDADE_ESCRITA = String.raw`[A-Za-zµÁ-úçÇ]+`
const QUANTIDADE_UNIDADE = new RegExp(String.raw`(?<![\d.,])(${NUMERO_BR})\s*(${UNIDADE_ESCRITA})`, 'g')
const UNIDADE_QUANTIDADE = new RegExp(String.raw`(?<![A-Za-zµÁ-úçÇ])(${UNIDADE_ESCRITA})\s*(${NUMERO_BR})(?![\d.,]*\d)`, 'g')
const PERCENTUAL = /(\d+(?:[.,]\d+)?)\s*%/g
const alfanumerico = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const mesmoNumero = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))
const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Confere o que a IA leu de uma linha contra o texto dela. Código, quantidade
// com a unidade e nome precisam estar escritos na linha; EAN, teor e observação
// que não estiverem ficam de fora. Qualquer coisa que não confira: null, e a
// linha continua sem leitura.
export function conferirLeituraIa(linha: LinhaNaoLida, resposta: unknown): ItemLidoPelaIa | null {
  const r = (resposta ?? {}) as Record<string, unknown>
  const texto = linha.continuacao ? `${linha.texto} ${linha.continuacao}` : linha.texto
  const textoAlfa = alfanumerico(texto)

  const codigo = String(r.codigo ?? '').trim()
  // O código fica na linha do produto, não na continuação
  if (!/^\d{3,15}$/.test(codigo) || !new RegExp(`(^|\\D)${codigo}(\\D|$)`).test(linha.texto)) return null

  const quantidade = Number(r.quantidade)
  const unidadeLida = typeof r.unidade === 'string' ? r.unidade.trim() : ''
  const unidade = normalizarUnidade(unidadeLida)
  if (!(quantidade > 0) || !ehUnidadeQuantidade(unidade)) return null
  const confere = (numero: string, u: string) => mesmoNumero(numeroBR(numero), quantidade) && normalizarUnidade(u) === unidade
  const escrita =
    [...texto.matchAll(QUANTIDADE_UNIDADE)].some(([, numero, u]) => confere(numero, u)) ||
    [...texto.matchAll(UNIDADE_QUANTIDADE)].some(([, u, numero]) => confere(numero, u))
  if (!escrita) return null

  const nome = typeof r.nome === 'string' ? r.nome.replace(TEOR, '').replace(TEOR_CORTADO, '').trim() : ''
  if (nome.length > 300 || alfanumerico(nome).length < 2 || !textoAlfa.includes(alfanumerico(nome))) return null

  const ean = typeof r.ean === 'string' ? r.ean.trim().toUpperCase() : ''
  const eanNaLinha = /^[0-9A-Z]{1,14}$/.test(ean) && new RegExp(`(^|\\s)${escaparRegex(ean)}(\\s|$)`, 'i').test(linha.texto)

  let teor: number | null = null
  let teorImpossivel: string | null = null
  const teorLido = r.teor == null ? NaN : Number(r.teor)
  const teorNaLinha = [...texto.matchAll(PERCENTUAL)].some(([, n]) => mesmoNumero(Number(n.replace(',', '.')), teorLido))
  if (Number.isFinite(teorLido) && teorNaLinha) {
    if (teorLido > 0 && teorLido <= 100) teor = teorLido
    else teorImpossivel = String(teorLido)
  }

  const observacao = typeof r.observacao === 'string' ? r.observacao.trim() : ''
  const observacaoNaLinha = observacao.length > 0 && observacao.length <= 60 && textoAlfa.includes(alfanumerico(observacao))

  return {
    linha,
    item: {
      codigo,
      ean: eanNaLinha ? ean : null,
      nome,
      teor,
      quantidade,
      unidade,
      observacao: observacaoNaLinha ? observacao : null,
    },
    teorImpossivel,
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
