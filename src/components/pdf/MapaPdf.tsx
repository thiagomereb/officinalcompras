import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { CandidatoItem } from '@/lib/comparacao'
import { sugestaoDoGrupo } from '@/lib/compras'
import type { DocumentoMapa } from '@/lib/mapas'
import { COR, Marca, Marcador, Rodape, Tabela, dataCurta, dataHora, estilos, moeda, precoBase, type Coluna } from './base'

const SITUACAO = {
  rascunho: { texto: 'RASCUNHO', cor: COR.ardosia },
  aprovado: { texto: 'APROVADO', cor: COR.salvia },
  exportado: { texto: 'APROVADO', cor: COR.salvia },
  cancelado: { texto: 'CANCELADO', cor: COR.oxido },
} as const

export function MapaPdf({ doc, geradoEm }: { doc: DocumentoMapa; geradoEm: string }) {
  const { mapa, grupos, escolhas, total, rascunho, orcamentos } = doc
  const situacao = SITUACAO[mapa.status as keyof typeof SITUACAO] ?? SITUACAO.rascunho
  const comprados = grupos.filter((g) => escolhas.has(g.insumo_id)).length

  return (
    <Document title={`Mapa de cotação — ${mapa.titulo}`} author="Officinal Compras" language="pt-BR">
      <Page size="A4" style={estilos.pagina}>
        {/* Cabeçalho */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Marca />
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                borderWidth: 1.5,
                borderColor: situacao.cor,
                color: situacao.cor,
                fontFamily: 'Helvetica-Bold',
                fontSize: 9,
                letterSpacing: 0.8,
                paddingVertical: 3,
                paddingHorizontal: 7,
              }}
            >
              {situacao.texto}
            </Text>
            <Text style={[estilos.suave, { fontSize: 7.5, marginTop: 4 }]}>Gerado em {geradoEm}</Text>
          </View>
        </View>

        <View style={{ marginTop: 16, paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: COR.grafite }}>
          <Text style={estilos.rotulo}>Mapa de cotação</Text>
          <Text style={[estilos.titulo, { marginTop: 2 }]}>{mapa.titulo}</Text>
          <Text style={[estilos.suave, { marginTop: 4 }]}>
            {grupos.length} insumo(s) comparado(s) · {comprados} com fornecedor escolhido · {orcamentos} orçamento(s)
          </Text>
          {mapa.aprovado_em && (
            <Text style={[estilos.suave, { marginTop: 2 }]}>
              Aprovado em {dataHora(mapa.aprovado_em)}
              {mapa.aprovado_por ? ` por ${mapa.aprovado_por}` : ''}
            </Text>
          )}
          {mapa.status === 'cancelado' && (
            <Text style={{ marginTop: 2, color: COR.oxido }}>
              Cancelado{mapa.cancelado_em ? ` em ${dataHora(mapa.cancelado_em)}` : ''}
              {mapa.cancelado_por ? ` por ${mapa.cancelado_por}` : ''}. Motivo: {mapa.motivo_cancelamento ?? '—'}
            </Text>
          )}
          <Text style={[estilos.suave, { marginTop: 2, fontSize: 7.5 }]}>
            A sugestão é a oferta de menor preço por unidade base; a escolha é do comprador.
          </Text>
        </View>

        {/* Um bloco por insumo */}
        {grupos.map((grupo) => {
          const escolha = escolhas.get(grupo.insumo_id)
          const sugestao = sugestaoDoGrupo(grupo)
          const colunas: Coluna<CandidatoItem>[] = [
            {
              titulo: 'Fornecedor',
              largura: 156,
              valor: (c) => `${c.fornecedor_nome}${sugestao?.cotacao_item_id === c.cotacao_item_id ? ' (sugestão)' : ''}`,
            },
            { titulo: 'Preço', largura: 54, alinhar: 'right', valor: (c) => moeda(c.preco_unitario) },
            {
              titulo: 'Embalagem',
              largura: 52,
              alinhar: 'center',
              valor: (c) => `${c.quantidade_minima ? `${c.quantidade_minima} ` : ''}${c.unidade ?? '—'}`,
            },
            { titulo: 'Por unid. base', largura: 70, alinhar: 'right', valor: (c) => precoBase(c.preco_base, c.unidade_base) },
            { titulo: 'Entrega', largura: 36, alinhar: 'right', valor: (c) => (c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias} d` : '—') },
            { titulo: 'Pgto', largura: 32, alinhar: 'right', valor: (c) => (c.prazo_pagamento_dias != null ? `${c.prazo_pagamento_dias} d` : '—') },
            { titulo: 'Frete', largura: 44, alinhar: 'right', valor: (c) => (c.frete_fixo == null ? '—' : c.frete_fixo > 0 ? moeda(c.frete_fixo) : 'grátis') },
            { titulo: 'Val. lote', largura: 52, alinhar: 'center', valor: (c) => dataCurta(c.validade) },
            {
              titulo: '',
              largura: 23,
              valor: (c) => (escolha?.cotacao_item_id === c.cotacao_item_id ? <Marcador /> : ''),
            },
          ]

          return (
            <View key={grupo.insumo_id} style={{ marginTop: 14 }} wrap={grupo.candidatos.length > 15}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={[estilos.negrito, { fontSize: 10 }]}>{grupo.insumo_nome}</Text>
                {!escolha && <Text style={[estilos.suave, { fontSize: 8 }]}>não comprado</Text>}
              </View>
              <Tabela
                colunas={colunas}
                linhas={grupo.candidatos}
                chave={(c) => c.cotacao_item_id}
                destaque={(c) => escolha?.cotacao_item_id === c.cotacao_item_id}
              />
              {escolha && (
                <Text style={[estilos.suave, { marginTop: 3, fontSize: 8 }]}>
                  Quantidade:{' '}
                  <Text style={{ color: COR.grafite, fontFamily: 'Helvetica-Bold' }}>
                    {escolha.quantidade != null
                      ? `${escolha.quantidade.toLocaleString('pt-BR')} ${escolha.quantidade_unidade ?? ''}`
                      : '—'}
                  </Text>
                  {escolha.valor != null && (
                    <>
                      {' · '}Valor:{' '}
                      <Text style={{ color: COR.grafite, fontFamily: 'Helvetica-Bold' }}>{moeda(escolha.valor)}</Text>
                    </>
                  )}
                </Text>
              )}
            </View>
          )
        })}

        {total != null && total > 0 && (
          <View
            style={{
              marginTop: 16,
              paddingTop: 6,
              borderTopWidth: 1,
              borderTopColor: COR.linha,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 8,
            }}
            wrap={false}
          >
            <Text style={estilos.suave}>Valor total {rascunho ? 'estimado' : 'aprovado'}</Text>
            <Text style={[estilos.negrito, { fontSize: 11 }]}>{moeda(total)}</Text>
          </View>
        )}

        {/* Assinaturas */}
        <View style={{ marginTop: 40, flexDirection: 'row', gap: 48 }} wrap={false}>
          {['Assinatura do comprador', 'Aprovação da diretoria'].map((texto) => (
            <View key={texto} style={{ flex: 1 }}>
              <View style={{ height: 32, borderBottomWidth: 0.75, borderBottomColor: COR.ardosia2 }} />
              <Text style={[estilos.suave, { fontSize: 7.5, marginTop: 4 }]}>{texto}</Text>
            </View>
          ))}
        </View>

        <Rodape texto={`Officinal Compras · Mapa de cotação · ${mapa.titulo}`} />
      </Page>
    </Document>
  )
}
