import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentoMapa } from '@/lib/mapas'
import { montarMapaImpresso, type PrecoImpresso } from '@/lib/mapa-impresso'
import { COR, Rodape, dataHora } from './base'

// Mesmo formato do relatório do ERP ([461] MAPA DE COTAÇÃO): cada produto
// pedido, a quantidade e, embaixo, todos os fornecedores da cotação com o
// preço por unidade (g, mL ou un); o asterisco marca de quem comprar.

const MARGEM = 24
const LARGURA_UTIL = 841.89 - 2 * MARGEM
const POR_LINHA = 15
// Uma sobra de 1pt para o arredondamento não jogar a última célula para baixo
const CELULA = (LARGURA_UTIL - 1) / POR_LINHA
const COLUNA_CODIGO = 52

const numero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

function preco(p: PrecoImpresso) {
  const n = p.valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: Math.abs(p.valor) < 0.01 ? 6 : 4,
  })
  return p.comparavel || !p.base ? n : `${n}/${p.base}`
}

// Larguras da Helvetica (milésimos do tamanho da fonte); o resto é 556
const LARGURAS: [string, number][] = [
  ["'", 191],
  ['ijl', 222],
  ['|', 260],
  [' .,:;!If/\\[]t', 278],
  ['-()`r', 333],
  ['*', 389],
  ['Jckvsxyz', 500],
  ['+<=>~', 584],
  ['FTZ', 611],
  ['ABEKPSVXY&', 667],
  ['CDHNRUw', 722],
  ['GOQ', 778],
  ['mM', 833],
  ['%', 889],
  ['W', 944],
  ['…', 1000],
  ['@', 1015],
]
const LARGURA = new Map(LARGURAS.flatMap(([cs, l]) => [...cs].map((c) => [c, l] as const)))
const largura = (texto: string, tamanho: number) =>
  [...texto.normalize('NFD').replace(/[̀-ͯ]/g, '')].reduce((s, c) => s + (LARGURA.get(c) ?? 556), 0) *
  (tamanho / 1000)

// O nome é cortado para caber na célula, como no ERP
function caber(nome: string, espaco: number, tamanho: number) {
  if (largura(nome, tamanho) <= espaco) return nome
  let corte = nome
  while (corte && largura(corte.trimEnd() + '…', tamanho) > espaco) corte = corte.slice(0, -1)
  return corte.trimEnd() + '…'
}
const FONTE_NOME = 6.5
const ESPACO_NOME = CELULA - 5

function situacao(doc: DocumentoMapa): { texto: string; cor: string } {
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

export function MapaPdf({ doc, geradoEm }: { doc: DocumentoMapa; geradoEm: string }) {
  const { mapa, cotacaoPropria, orcamentos } = doc
  const { fornecedores, linhas } = montarMapaImpresso({
    pedidos: doc.pedidos,
    grupos: doc.grupos,
    escolhas: doc.escolhas,
    fornecedoresDosOrcamentos: doc.fornecedores,
  })
  const sit = situacao(doc)

  return (
    <Document title={`Mapa de cotação — ${mapa.titulo}`} author="Officinal Compras" language="pt-BR">
      <Page
        size="A4"
        orientation="landscape"
        style={{ paddingTop: MARGEM, paddingBottom: 40, paddingHorizontal: MARGEM, fontFamily: 'Helvetica', fontSize: 8, color: COR.grafite }}
      >
        {/* Cabeçalho, repetido em toda página como no ERP */}
        <View fixed>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12 }}>MAPA DE COTAÇÃO</Text>
            <Text style={{ fontSize: 8, color: COR.ardosia }}>{geradoEm}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2 }}>
            <Text style={{ fontSize: 7.5, color: sit.cor }}>
              {mapa.titulo} · {orcamentos} orçamento(s) · {sit.texto}
            </Text>
            {cotacaoPropria && (
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>COTAÇÃO: {cotacaoPropria.numero}</Text>
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              marginTop: 6,
              paddingTop: 3,
              paddingBottom: 2,
              borderTopWidth: 1,
              borderTopColor: COR.grafite,
              borderBottomWidth: 1,
              borderBottomColor: COR.grafite,
              fontFamily: 'Helvetica-Bold',
              fontSize: 8,
            }}
          >
            <Text style={{ width: COLUNA_CODIGO }}>CÓDIGO</Text>
            <Text style={{ flex: 1 }}>PRODUTO</Text>
            <Text>QTDE.</Text>
          </View>
        </View>

        {linhas.length === 0 && (
          <Text style={{ marginTop: 16, color: COR.ardosia }}>Nenhum produto neste mapa.</Text>
        )}

        {linhas.map((l, i) => (
          <View
            key={`${l.codigo ?? ''}-${i}`}
            wrap={false}
            style={{ paddingTop: 4, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: COR.ardosia2 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={{ width: COLUNA_CODIGO, fontFamily: 'Helvetica-Bold' }}>{l.codigo ?? '—'}</Text>
              <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold' }}>{l.nome}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                  {l.quantidade != null ? `${numero(l.quantidade)} ${l.unidade ?? ''}` : '—'}
                </Text>
              </View>
            </View>
            {l.compra && (
              <Text style={{ textAlign: 'right', fontSize: 7, color: COR.ambarTinta }}>
                comprar {numero(l.compra.quantidade)} {l.compra.unidade ?? ''}
              </Text>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
              {fornecedores.map((f) => {
                const p = l.precos[f]
                return (
                  <View key={f} style={{ width: CELULA, paddingRight: 4, marginBottom: 1 }}>
                    {/* Altura de uma linha: o nome nunca quebra e os preços ficam alinhados */}
                    <View style={{ height: 8, overflow: 'hidden' }}>
                      <Text style={{ fontSize: FONTE_NOME, color: COR.ardosia }}>{caber(f, ESPACO_NOME, FONTE_NOME)}</Text>
                    </View>
                    <Text
                      style={{
                        textAlign: 'right',
                        fontSize: 7.5,
                        fontFamily: p?.escolhido ? 'Helvetica-Bold' : 'Helvetica',
                        color: p ? COR.grafite : COR.ardosia2,
                      }}
                    >
                      {p ? `${preco(p)}${p.escolhido ? ' *' : ''}` : '-'}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        ))}

        <Rodape texto={`* fornecedor escolhido · preço por g, mL ou un · Officinal Compras · ${mapa.titulo}`} />
      </Page>
    </Document>
  )
}
