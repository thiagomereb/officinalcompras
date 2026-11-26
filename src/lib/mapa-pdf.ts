import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import type { DocumentoMapa } from './mapas'
import { montarMapaImpresso, type LinhaImpressa, type PrecoImpresso } from './mapa-impresso'

// O mapa impresso no formato do relatório do ERP ([461] MAPA DE COTAÇÃO): cada
// produto pedido, a quantidade e, embaixo, todos os fornecedores da cotação com
// o preço por unidade (g, mL ou un); o asterisco marca de quem comprar.
//
// Desenhado direto com a pdf-lib, texto a texto na posição calculada aqui. Com
// o react-pdf, um mapa grande (160 produtos × 30 fornecedores = 4.800 células)
// levava mais de 20 s no motor de layout e a função do Netlify era cortada.

const LARGURA = 841.89 // A4 deitado
const ALTURA = 595.28
const MARGEM = 24
// Onde o conteúdo para: o rodapé fica embaixo disso
const FIM_CONTEUDO = ALTURA - 40
const UTIL = LARGURA - 2 * MARGEM
const POR_LINHA = 15
// Uma sobra de 1pt para o arredondamento
const CELULA = (UTIL - 1) / POR_LINHA
const COLUNA_CODIGO = 52
const FONTE_NOME = 6.5
const FONTE_PRECO = 7.5
const ALTURA_CELULA = 15.5

const hex = (h: string): RGB =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

// As cores do sistema (globals.css)
const COR = {
  grafite: hex('#1c2226'),
  ardosia: hex('#5c656a'),
  ardosia2: hex('#8a9397'),
  ambarTinta: hex('#8a5409'),
  salvia: hex('#2f6b52'),
  oxido: hex('#a63a2b'),
}

const numero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

function precoTexto(p: PrecoImpresso) {
  const n = p.valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: Math.abs(p.valor) < 0.01 ? 6 : 4,
  })
  return p.comparavel || !p.base ? n : `${n}/${p.base}`
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

type Fontes = { normal: PDFFont; negrito: PDFFont }

// As fontes padrão do PDF (Helvetica) só têm os caracteres do WinAnsi, que
// cobre o português; o que estiver fora vira "?" em vez de derrubar o PDF
function limpador(fonte: PDFFont) {
  const aceitos = new Set(fonte.getCharacterSet())
  return (texto: string) =>
    [...texto.replace(/\s+/g, ' ')].map((c) => (aceitos.has(c.codePointAt(0)!) ? c : '?')).join('')
}

// Corta o texto para caber na largura, com reticências
function caber(texto: string, fonte: PDFFont, tamanho: number, espaco: number) {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= espaco) return texto
  let corte = texto
  while (corte && fonte.widthOfTextAtSize(corte.trimEnd() + '…', tamanho) > espaco) corte = corte.slice(0, -1)
  return corte.trimEnd() + '…'
}

// Quebra em linhas pelas palavras; palavra maior que a linha é cortada
function quebrar(texto: string, fonte: PDFFont, tamanho: number, espaco: number): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= espaco) atual = tentativa
    else {
      if (atual) linhas.push(atual)
      atual = caber(palavra, fonte, tamanho, espaco)
    }
  }
  if (atual) linhas.push(atual)
  return linhas.length ? linhas : ['']
}

function situacao(doc: DocumentoMapa): { texto: string; cor: RGB } {
  const { mapa } = doc
  if (mapa.status === 'cancelado') {
    return {
      texto: `Cancelado${mapa.cancelado_em ? ` em ${dataHora(mapa.cancelado_em)}` : ''}${mapa.cancelado_por ? ` por ${mapa.cancelado_por}` : ''}. Motivo: ${mapa.motivo_cancelamento ?? '—'}`,
      cor: COR.oxido,
    }
  }
  if (mapa.aprovado_em) {
    return {
      texto: `Aprovado em ${dataHora(mapa.aprovado_em)}${mapa.aprovado_por ? ` por ${mapa.aprovado_por}` : ''}`,
      cor: COR.salvia,
    }
  }
  return { texto: 'Rascunho: as escolhas ainda podem mudar', cor: COR.ardosia }
}

export async function gerarMapaPdf(doc: DocumentoMapa, geradoEm: string): Promise<Uint8Array> {
  const { mapa, cotacaoPropria, orcamentos } = doc
  const { fornecedores, linhas } = montarMapaImpresso({
    pedidos: doc.pedidos,
    grupos: doc.grupos,
    escolhas: doc.escolhas,
    fornecedoresDosOrcamentos: doc.fornecedores,
  })

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Mapa de cotação — ${mapa.titulo}`)
  pdf.setAuthor('Officinal Compras')
  pdf.setLanguage('pt-BR')
  const f: Fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) }
  const limpar = limpador(f.normal)

  // topo: distância do alto da página até a linha de base do texto
  const escrever = (
    pagina: PDFPage,
    texto: string,
    x: number,
    topo: number,
    { tamanho = 8, fonte = f.normal, cor = COR.grafite, direita = false }: { tamanho?: number; fonte?: PDFFont; cor?: RGB; direita?: boolean } = {},
  ) => {
    const t = limpar(texto)
    const xi = direita ? x - fonte.widthOfTextAtSize(t, tamanho) : x
    pagina.drawText(t, { x: xi, y: ALTURA - topo, size: tamanho, font: fonte, color: cor })
  }
  const linhaHorizontal = (pagina: PDFPage, topo: number, espessura: number, cor: RGB) =>
    pagina.drawLine({ start: { x: MARGEM, y: ALTURA - topo }, end: { x: LARGURA - MARGEM, y: ALTURA - topo }, thickness: espessura, color: cor })

  const sit = situacao(doc)
  const nomeNaCelula = new Map(fornecedores.map((nome) => [nome, caber(limpar(nome), f.normal, FONTE_NOME, CELULA - 5)]))

  // Cabeçalho, repetido em toda página como no ERP; devolve onde o conteúdo começa
  const novaPagina = () => {
    const p = pdf.addPage([LARGURA, ALTURA])
    escrever(p, 'MAPA DE COTAÇÃO', MARGEM, MARGEM + 10, { tamanho: 12, fonte: f.negrito })
    escrever(p, geradoEm, LARGURA - MARGEM, MARGEM + 10, { cor: COR.ardosia, direita: true })
    const numeroCotacao = cotacaoPropria ? `COTAÇÃO: ${cotacaoPropria.numero}` : ''
    const larguraNumero = numeroCotacao ? f.negrito.widthOfTextAtSize(numeroCotacao, 10) + 12 : 0
    escrever(p, caber(limpar(`${mapa.titulo} · ${orcamentos} orçamento(s) · ${sit.texto}`), f.normal, 7.5, UTIL - larguraNumero), MARGEM, MARGEM + 24, {
      tamanho: 7.5,
      cor: sit.cor,
    })
    if (numeroCotacao) escrever(p, numeroCotacao, LARGURA - MARGEM, MARGEM + 24, { tamanho: 10, fonte: f.negrito, direita: true })
    const faixa = MARGEM + 30
    linhaHorizontal(p, faixa, 1, COR.grafite)
    escrever(p, 'CÓDIGO', MARGEM, faixa + 10, { fonte: f.negrito })
    escrever(p, 'PRODUTO', MARGEM + COLUNA_CODIGO, faixa + 10, { fonte: f.negrito })
    escrever(p, 'QTDE.', LARGURA - MARGEM, faixa + 10, { fonte: f.negrito, direita: true })
    linhaHorizontal(p, faixa + 14, 1, COR.grafite)
    return { pagina: p, topo: faixa + 18 }
  }

  let { pagina, topo } = novaPagina()

  if (linhas.length === 0) escrever(pagina, 'Nenhum produto neste mapa.', MARGEM, topo + 16, { cor: COR.ardosia })

  const faixas = Math.max(1, Math.ceil(fornecedores.length / POR_LINHA))

  const desenharProduto = (l: LinhaImpressa, nomes: string[], qtd: string) => {
    let t = topo + 4
    escrever(pagina, l.codigo ?? '—', MARGEM, t + 8, { fonte: f.negrito })
    nomes.forEach((n, i) => escrever(pagina, n, MARGEM + COLUNA_CODIGO, t + 8 + i * 10, { fonte: f.negrito }))
    escrever(pagina, qtd, LARGURA - MARGEM, t + 8, { fonte: f.negrito, direita: true })
    t += nomes.length * 10
    if (l.compra) {
      escrever(pagina, `comprar ${numero(l.compra.quantidade)} ${l.compra.unidade ?? ''}`.trim(), LARGURA - MARGEM, t + 7, {
        tamanho: 7,
        cor: COR.ambarTinta,
        direita: true,
      })
      t += 9
    }
    t += 2
    fornecedores.forEach((nome, i) => {
      const x = MARGEM + (i % POR_LINHA) * CELULA
      const linhaTopo = t + Math.floor(i / POR_LINHA) * ALTURA_CELULA
      escrever(pagina, nomeNaCelula.get(nome)!, x, linhaTopo + 6, { tamanho: FONTE_NOME, cor: COR.ardosia })
      const p = l.precos[nome]
      escrever(pagina, p ? `${precoTexto(p)}${p.escolhido ? ' *' : ''}` : '-', x + CELULA - 4, linhaTopo + 14, {
        tamanho: FONTE_PRECO,
        fonte: p?.escolhido ? f.negrito : f.normal,
        cor: p ? COR.grafite : COR.ardosia2,
        direita: true,
      })
    })
    t += faixas * ALTURA_CELULA + 3
    linhaHorizontal(pagina, t, 0.5, COR.ardosia2)
  }

  for (const l of linhas) {
    const qtd = l.quantidade != null ? `${numero(l.quantidade)} ${l.unidade ?? ''}`.trim() : '—'
    const larguraQtd = f.negrito.widthOfTextAtSize(limpar(qtd), 8)
    const nomes = quebrar(limpar(l.nome), f.negrito, 8, UTIL - COLUNA_CODIGO - larguraQtd - 8)
    const altura = 4 + nomes.length * 10 + (l.compra ? 9 : 0) + 2 + faixas * ALTURA_CELULA + 3.5

    // O produto não se divide entre páginas
    if (topo + altura > FIM_CONTEUDO) ({ pagina, topo } = novaPagina())
    desenharProduto(l, nomes, qtd)
    topo += altura
  }

  // Rodapé com a numeração, depois de saber quantas páginas são
  const paginas = pdf.getPages()
  const rodape = `* fornecedor escolhido · preço por g, mL ou un · Officinal Compras · ${mapa.titulo}`
  paginas.forEach((p, i) => {
    escrever(p, caber(limpar(rodape), f.normal, 7, UTIL - 80), MARGEM, ALTURA - 22, { tamanho: 7, cor: COR.ardosia2 })
    escrever(p, `Página ${i + 1} de ${paginas.length}`, LARGURA - MARGEM, ALTURA - 22, { tamanho: 7, cor: COR.ardosia2, direita: true })
  })

  return pdf.save()
}
