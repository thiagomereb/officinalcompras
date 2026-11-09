import { Path, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'

// Mesmas cores do sistema (globals.css). Helvetica é fonte padrão do PDF: tem
// todos os acentos do português e não depende de arquivo de fonte no servidor.
export const COR = {
  grafite: '#1c2226',
  ardosia: '#5c656a',
  ardosia2: '#8a9397',
  nevoa: '#eef0ee',
  linha: '#dae0dc',
  linha2: '#e9ece9',
  ambar: '#b26b12',
  ambarTinta: '#8a5409',
  ambarVeu: '#f7ecdc',
  salvia: '#2f6b52',
  oxido: '#a63a2b',
}

export const estilos = StyleSheet.create({
  pagina: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COR.grafite,
  },
  negrito: { fontFamily: 'Helvetica-Bold' },
  suave: { color: COR.ardosia },
  rotulo: { fontSize: 7, color: COR.ardosia, textTransform: 'uppercase', letterSpacing: 0.3 },
  titulo: { fontFamily: 'Helvetica-Bold', fontSize: 16, lineHeight: 1.25 },
  linhaTabela: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: COR.linha2 },
  cabecalhoTabela: {
    flexDirection: 'row',
    backgroundColor: COR.nevoa,
    borderBottomWidth: 0.5,
    borderBottomColor: COR.linha,
  },
  celula: { paddingVertical: 4, paddingHorizontal: 4 },
  celulaCabecalho: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 7, color: COR.ardosia },
})

export function Frasco({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <Svg viewBox="0 0 20 24" width={tamanho * (20 / 24)} height={tamanho}>
      <Rect x={6.5} y={1} width={7} height={3.5} rx={1} fill={COR.grafite} />
      <Rect x={7.5} y={4.5} width={5} height={2.5} fill={COR.ambarTinta} />
      <Path d="M4 10.5A3.5 3.5 0 0 1 7.5 7h5a3.5 3.5 0 0 1 3.5 3.5V20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill={COR.ambar} />
      <Rect x={4} y={12.5} width={12} height={5.5} fill="#ffffff" />
      <Rect x={6} y={14.5} width={5.5} height={1.4} rx={0.7} fill={COR.ardosia} />
    </Svg>
  )
}

export function Marca() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Frasco />
      <View>
        <Text style={[estilos.negrito, { fontSize: 11 }]}>Officinal</Text>
        <Text style={{ fontSize: 6.5, color: COR.ambarTinta, letterSpacing: 0.5 }}>COMPRAS</Text>
      </View>
    </View>
  )
}

// Rodapé repetido em toda página, com a numeração. São textos fixos com
// posição absoluta direto na página: uma View fixa envolvendo os dois não era
// desenhada.
const estiloRodape = { position: 'absolute', bottom: 20, fontSize: 7, color: COR.ardosia2 } as const

export function Rodape({ texto }: { texto: string }) {
  return (
    <>
      <Text fixed style={{ ...estiloRodape, left: 36 }}>
        {texto}
      </Text>
      <Text
        fixed
        style={{ ...estiloRodape, right: 36 }}
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
      />
    </>
  )
}

export type Coluna<T> = {
  titulo: string
  largura: number
  alinhar?: 'right' | 'center'
  valor: (linha: T) => React.ReactNode
}

// Tabela simples. repetirCabecalho só para a tabela única de um documento:
// com várias tabelas na página (uma por insumo no mapa) os cabeçalhos fixos se
// acumulariam.
export function Tabela<T>({
  colunas,
  linhas,
  chave,
  destaque,
  repetirCabecalho = false,
}: {
  colunas: Coluna<T>[]
  linhas: T[]
  chave: (linha: T) => string
  // Linha escolhida pelo comprador: fundo âmbar claro e a aba âmbar à esquerda
  destaque?: (linha: T) => boolean
  repetirCabecalho?: boolean
}) {
  return (
    <View>
      <View style={estilos.cabecalhoTabela} fixed={repetirCabecalho}>
        {colunas.map((c) => (
          <Text key={c.titulo} style={[estilos.celulaCabecalho, { width: c.largura, textAlign: c.alinhar ?? 'left' }]}>
            {c.titulo}
          </Text>
        ))}
      </View>
      {linhas.map((l) => {
        const marcada = destaque?.(l) ?? false
        const estiloLinha: Style[] = [estilos.linhaTabela]
        if (marcada) estiloLinha.push({ backgroundColor: COR.ambarVeu, borderLeftWidth: 2, borderLeftColor: COR.ambar })
        return (
          <View key={chave(l)} style={estiloLinha} wrap={false}>
            {colunas.map((c) => {
              const valor = c.valor(l)
              return (
                <View key={c.titulo} style={[estilos.celula, { width: c.largura }]}>
                  {typeof valor === 'string' || typeof valor === 'number' ? (
                    <Text style={{ textAlign: c.alinhar ?? 'left', fontFamily: marcada ? 'Helvetica-Bold' : 'Helvetica' }}>
                      {valor}
                    </Text>
                  ) : (
                    valor
                  )}
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const moeda = (v: number) => brl.format(v)

export function precoBase(valor: number, base: string | null) {
  const casas = Math.abs(valor) < 1 ? 4 : 2
  const n = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  return `R$ ${n}${base ? `/${base}` : ''}`
}

export const dataCurta = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

// Nome de arquivo sem acento nem caractere especial
export function nomeArquivo(prefixo: string, texto: string) {
  const slug = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${prefixo}${slug ? `-${slug}` : ''}.pdf`
}

export function respostaPdf(pdf: Uint8Array, arquivo: string) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${arquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
