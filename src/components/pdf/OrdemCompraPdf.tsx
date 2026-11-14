import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentoOrdens } from '@/lib/mapas'
import type { OrdemFornecedor } from '@/lib/ordem-compra'
import { COR } from './base'

// Mesmo formato do pedido do ERP ([420] PEDIDO DE COMPRA): uma ordem por
// fornecedor, cada uma começando em página nova, com a avaliação do
// fornecedor e da transportadora e o rodapé com os dados da farmácia.

const MONO = 'Courier'
const MONO_NEGRITO = 'Courier-Bold'
const MARGEM = 32

const COLUNAS = { validade: 62, quantidade: 66, unitario: 62, total: 66 }

// Como o ERP escreve as unidades
const UNIDADE_ERP: Record<string, string> = { un: 'u', mL: 'ml' }

const numero = (v: number, min: number, max: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })
const valor = (v: number) => numero(v, 2, 2)
const unitario = (v: number) => numero(v, 2, 4)

function dataBR(iso: string | null) {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : ''
}

const tracejado: Style = { borderBottomWidth: 0.75, borderBottomColor: COR.grafite, borderStyle: 'dashed' }
const linhaCheia: Style = { borderBottomWidth: 0.75, borderBottomColor: COR.grafite }

// Linha para preencher à mão, com o valor quando o sistema já tem
function Campo({ rotulo, valor: v, largura = 150 }: { rotulo: string; valor?: string | null; largura?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 5 }}>
      <Text style={{ fontFamily: MONO, fontSize: 8.5 }}>{rotulo} </Text>
      <Text style={{ ...linhaCheia, width: largura, fontFamily: MONO, fontSize: 8.5, paddingLeft: 3 }}>{v ?? ' '}</Text>
    </View>
  )
}

function Avaliacao({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <View style={{ marginTop: 14, paddingHorizontal: 60 }}>
      <Text style={{ fontFamily: MONO, fontSize: 9, textAlign: 'center' }}>*** {titulo} ***</Text>
      <View style={{ ...tracejado, marginTop: 3, marginBottom: 4 }} />
      {itens.map((item) => (
        <View key={item} style={{ flexDirection: 'row', fontFamily: MONO, fontSize: 8.5, marginTop: 2 }}>
          <Text style={{ flex: 1 }}>{item}</Text>
          <Text style={{ width: 92 }}>CONFORME (   )</Text>
          <Text style={{ width: 118 }}>NÃO CONFORME (   )</Text>
        </View>
      ))}
    </View>
  )
}

function Assinatura({ texto }: { texto: string }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ ...linhaCheia, height: 26 }} />
      <Text style={{ fontFamily: MONO, fontSize: 8, marginTop: 3, textAlign: 'center' }}>{texto}</Text>
    </View>
  )
}

function Ordem({ ordem, doc, geradoEm }: { ordem: OrdemFornecedor; doc: DocumentoOrdens; geradoEm: string }) {
  const { empresa } = doc
  const prazo = (dias: number | null) => (dias == null ? null : dias === 0 ? 'à vista' : `${dias} dias`)

  return (
    // Preto puro: é documento para imprimir, e a Courier é fina
    <Page size="A4" style={{ paddingTop: MARGEM, paddingBottom: 70, paddingHorizontal: MARGEM, color: '#000' }}>
      {/* Cabeçalho */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: MONO_NEGRITO, fontSize: 11 }}>PEDIDO DE COMPRA</Text>
        <Text style={{ fontFamily: MONO, fontSize: 9 }}>{geradoEm}</Text>
      </View>
      <View style={{ ...linhaCheia, marginTop: 2 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
        <Text style={{ fontFamily: MONO_NEGRITO, fontSize: 10 }}>À {ordem.fornecedor.toUpperCase()}</Text>
        <Text style={{ fontFamily: MONO_NEGRITO, fontSize: 10 }}>PEDIDO Nº: {doc.numero ?? '—'}</Text>
      </View>
      <Text style={{ fontFamily: MONO, fontSize: 9, marginTop: 2 }}>Att. Departamento de compras</Text>

      <Text style={{ fontFamily: MONO_NEGRITO, fontSize: 9, marginTop: 14, paddingBottom: 2, ...linhaCheia }}>
        PREZADO FORNECEDOR, ENVIO O PEDIDO P/ COMPRA DE PRODUTOS CONFORME RELAÇÃO ABAIXO:
      </Text>

      {/* Itens */}
      <View
        style={{ flexDirection: 'row', marginTop: 8, paddingBottom: 2, ...linhaCheia, fontFamily: 'Helvetica-Bold', fontSize: 8 }}
      >
        <Text style={{ flex: 1 }}>PRODUTO</Text>
        <Text style={{ width: COLUNAS.validade, textAlign: 'center' }}>DT. VALIDADE</Text>
        <Text style={{ width: COLUNAS.quantidade, textAlign: 'right' }}>QTDE.</Text>
        <Text style={{ width: COLUNAS.unitario, textAlign: 'right' }}>VLR. UNIT.</Text>
        <Text style={{ width: COLUNAS.total, textAlign: 'right' }}>VLR. TOTAL</Text>
      </View>
      {ordem.linhas.map((l, i) => (
        <View
          key={i}
          wrap={false}
          style={{
            flexDirection: 'row',
            paddingVertical: 2.5,
            borderBottomWidth: 0.5,
            borderBottomColor: COR.ardosia2,
            fontFamily: 'Helvetica',
            fontSize: 8,
          }}
        >
          <Text style={{ flex: 1, paddingRight: 6 }}>{l.produto}</Text>
          <Text style={{ width: COLUNAS.validade, textAlign: 'center' }}>{dataBR(l.validade)}</Text>
          <Text style={{ width: COLUNAS.quantidade, textAlign: 'right' }}>
            {l.quantidade != null ? `${numero(l.quantidade, 0, 3)} ${UNIDADE_ERP[l.unidade ?? ''] ?? l.unidade ?? ''}` : '—'}
          </Text>
          <Text style={{ width: COLUNAS.unitario, textAlign: 'right' }}>
            {l.precoUnitario != null ? unitario(l.precoUnitario) : '—'}
          </Text>
          <Text style={{ width: COLUNAS.total, textAlign: 'right' }}>{l.total != null ? valor(l.total) : '—'}</Text>
        </View>
      ))}

      {/* Totais */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }} wrap={false}>
        <Text style={{ fontFamily: MONO, fontSize: 9 }}>QTDE.: {ordem.linhas.length}</Text>
        <View style={{ fontFamily: MONO, fontSize: 9 }}>
          {(
            [
              ['VLR. TOTAL DO PEDIDO:', valor(ordem.total)],
              ['VLR. EXTRA:', '0,00'],
              ['DESCONTO:', '0,00'],
              ['VLR. NEGOCIADO:', '0,00'],
            ] as const
          ).map(([rotulo, v]) => (
            <View key={rotulo} style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Text style={{ textAlign: 'right' }}>{rotulo}</Text>
              <Text style={{ width: 90, textAlign: 'right' }}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
      {ordem.incompleto && (
        <Text style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: COR.ardosia, marginTop: 3 }}>
          Item com — no valor: a quantidade está em outra unidade que a oferta e não entra no total.
        </Text>
      )}

      {/* Condições, assinaturas e avaliações ficam juntas */}
      <View wrap={false}>
        <View style={{ ...linhaCheia, marginTop: 8 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <View>
            <Campo rotulo="PRAZO PAGTO.:" valor={prazo(ordem.prazoPagamentoDias)} />
            <Campo rotulo="PRAZO ENTREGA:" valor={prazo(ordem.prazoEntregaDias)} />
            <Text style={{ fontFamily: MONO, fontSize: 8.5, marginTop: 8 }}>OBSERVAÇÃO:</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Campo rotulo="DATA DA COMPRA:" valor="     /     /" largura={110} />
            <Campo rotulo="VENDEDOR:" largura={110} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 60, marginTop: 22 }}>
          <Assinatura texto="ASSINATURA DO RESPONSÁVEL PELA AQUISIÇÃO" />
          <Assinatura texto="ASSINATURA DO RESPONSÁVEL PELA APROVAÇÃO" />
        </View>

        <Avaliacao
          titulo="AVALIAÇÃO DO DESEMPENHO DO FORNECEDOR"
          itens={[
            '1.DATA DE VALIDADE',
            '2.ESPECIFICACOES DO PRODUTO',
            '3.QUANTIDADES ENVIADAS',
            '4.CONDICOES EMBALAGENS',
            '5.ROTULOS DOS PRODUTOS',
            '6.LAUDOS DAS M.P.',
            '7.PRAZO ESTABELECIDO PARA ENTREGA',
            '8.CONTROLE DE QUALIDADE  ASS. ________',
          ]}
        />
        <Avaliacao
          titulo="AVALIAÇÃO DO DESEMPENHO DA TRANSPORTADORA"
          itens={['CONDICOES DAS EMBALAGENS', 'CUMPRIMENTO DOS PRAZOS', 'QUANTIDADE DE VOLUMES']}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 40, marginTop: 22 }}>
          <Assinatura texto="ASSINATURA DO RESPONSÁVEL PELO RECEBIMENTO" />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Campo rotulo="DATA DE CHEGADA:" valor="     /     /" largura={110} />
          </View>
        </View>
      </View>

      {/* Rodapé com os dados da farmácia, no pé de toda página */}
      {empresa && (
        <View fixed style={{ position: 'absolute', left: MARGEM, right: MARGEM, bottom: 22, fontFamily: MONO, fontSize: 7.5 }}>
          <View style={{ ...linhaCheia, marginBottom: 3 }} />
          <Text style={{ fontFamily: MONO_NEGRITO }}>
            {empresa.nome}
            {empresa.cnpj ? ` - ${empresa.cnpj}` : ''}
          </Text>
          {empresa.endereco && <Text>{empresa.endereco}</Text>}
          {(empresa.telefone || empresa.email) && (
            <Text>
              {[empresa.telefone && `Fone: ${empresa.telefone}`, empresa.email && `E-Mail: ${empresa.email}`]
                .filter(Boolean)
                .join(', ')}
            </Text>
          )}
        </View>
      )}
    </Page>
  )
}

export function OrdemCompraPdf({
  doc,
  ordens,
  geradoEm,
}: {
  doc: DocumentoOrdens
  ordens: OrdemFornecedor[]
  geradoEm: string
}) {
  const titulo = ordens.length === 1 ? `Pedido de compra — ${ordens[0].fornecedor}` : `Pedidos de compra — ${doc.mapa.titulo}`
  return (
    <Document title={titulo} author={doc.empresa?.nome ?? 'Officinal Compras'} language="pt-BR">
      {ordens.map((o) => (
        <Ordem key={o.chave} ordem={o} doc={doc} geradoEm={geradoEm} />
      ))}
    </Document>
  )
}
