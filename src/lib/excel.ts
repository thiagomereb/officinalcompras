import * as XLSX from 'xlsx'
import type { ItemExtraido } from './ocr'

// Aceita cabeçalhos variados por fornecedor — mesmo espírito do mapa de
// sinônimos de unidade em normalizarUnidade (cotacoes/actions.ts).
const ALIASES: Record<keyof ItemExtraido, string[]> = {
  descricao: ['descricao', 'produto', 'item', 'nome', 'discriminacao'],
  preco_unitario: ['preco unitario', 'preco unit', 'valor unitario', 'valor unit', 'preco', 'valor'],
  quantidade_embalagem: ['embalagem', 'qtd embalagem', 'qtde embalagem', 'quantidade embalagem'],
  quantidade: ['quantidade', 'qtd', 'qtde'],
  unidade: ['unidade', 'unid', 'und', 'un', 'medida'],
  pais_origem: ['pais de origem', 'pais origem', 'origem', 'pais'],
  ipi: ['ipi'],
  st: ['st', 'substituicao tributaria'],
  validade: ['validade', 'vencimento', 'data validade'],
  cas: ['cas', 'numero cas', 'cas number'],
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizarTexto(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function parseNumeroBR(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const limpo = v.trim().replace(/[^\d.,-]/g, '')
  if (!limpo) return null
  // "1.200,50" (formato BR) vs "1200.50" (já em ponto) — só troca separador
  // quando há vírgula, senão respeita o ponto como está.
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = parseFloat(normalizado)
  return Number.isFinite(n) ? n : null
}

function formatarData(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split('T')[0]
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v.trim())
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }
  return null
}

// Campos mais específicos primeiro: uma coluna já reivindicada não pode ser
// reaproveitada por outro campo (evita "un" de "unidade" casar com "Valor
// Unit.", por exemplo).
const ORDEM_PRIORIDADE: (keyof ItemExtraido)[] = [
  'descricao',
  'preco_unitario',
  'cas',
  'validade',
  'quantidade_embalagem',
  'quantidade',
  'unidade',
  'pais_origem',
  'ipi',
  'st',
]

function normalizarCabecalho(v: unknown): string {
  if (typeof v !== 'string') return ''
  return semAcento(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function mapearColunas(cabecalho: unknown[]): Partial<Record<keyof ItemExtraido, number>> {
  const normalizados = cabecalho.map(normalizarCabecalho)
  const usados = new Set<number>()
  const indices: Partial<Record<keyof ItemExtraido, number>> = {}

  for (const campo of ORDEM_PRIORIDADE) {
    const aliases = ALIASES[campo]

    // 1ª tentativa: cabeçalho bate exatamente com um dos aliases
    let indice = normalizados.findIndex((h, i) => !usados.has(i) && aliases.includes(h))

    // 2ª tentativa: alias aparece como palavra inteira no cabeçalho (evita
    // falso positivo de substring, ex: "un" dentro de "unit")
    if (indice === -1) {
      indice = normalizados.findIndex((h, i) => {
        if (usados.has(i) || !h) return false
        return aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(h))
      })
    }

    if (indice !== -1) {
      indices[campo] = indice
      usados.add(indice)
    }
  }

  return indices
}

export function extrairItensExcel(buffer: ArrayBuffer): ItemExtraido[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const planilha = workbook.Sheets[workbook.SheetNames[0]]
  if (!planilha) throw new Error('A planilha está vazia.')

  const linhas = XLSX.utils.sheet_to_json<unknown[]>(planilha, { header: 1, defval: null })
  if (linhas.length < 2) throw new Error('A planilha não tem linhas de dados abaixo do cabeçalho.')

  const [cabecalho, ...dados] = linhas
  const indices = mapearColunas(cabecalho)

  if (indices.descricao == null || indices.preco_unitario == null) {
    throw new Error(
      'Não foi possível identificar as colunas de descrição e preço no cabeçalho da planilha. Renomeie para algo como "Produto" e "Preço Unitário".',
    )
  }

  const itens: ItemExtraido[] = dados
    .map((linha): ItemExtraido | null => {
      const descricao = normalizarTexto(linha[indices.descricao!])
      const preco_unitario = parseNumeroBR(linha[indices.preco_unitario!])
      if (!descricao || preco_unitario == null || preco_unitario <= 0) return null

      return {
        descricao,
        preco_unitario,
        quantidade_embalagem:
          indices.quantidade_embalagem != null ? parseNumeroBR(linha[indices.quantidade_embalagem]) : null,
        quantidade: indices.quantidade != null ? parseNumeroBR(linha[indices.quantidade]) : null,
        unidade: indices.unidade != null ? normalizarTexto(linha[indices.unidade]) : null,
        pais_origem: indices.pais_origem != null ? normalizarTexto(linha[indices.pais_origem]) : null,
        ipi: indices.ipi != null ? (parseNumeroBR(linha[indices.ipi]) ?? 0) : 0,
        st: indices.st != null ? (parseNumeroBR(linha[indices.st]) ?? 0) : 0,
        validade: indices.validade != null ? formatarData(linha[indices.validade]) : null,
        cas: indices.cas != null ? normalizarTexto(linha[indices.cas]) : null,
      }
    })
    .filter((item): item is ItemExtraido => item !== null)

  if (itens.length === 0) throw new Error('Nenhum item com preço válido encontrado na planilha.')

  return itens
}
