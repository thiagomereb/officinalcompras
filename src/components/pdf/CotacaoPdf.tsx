import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { Tables } from '@/types/database'
import { precoPorUnidadeBase } from '@/lib/unidades'
import { COR, Marca, Rodape, Tabela, dataCurta, estilos, moeda, precoBase, type Coluna } from './base'

export type ItemCotacaoPdf = Tables<'cotacao_itens'> & { insumo_nome: string | null }

export function CotacaoPdf({
  cotacao,
  fornecedor,
  itens,
  geradoEm,
}: {
  cotacao: Tables<'cotacoes'>
  fornecedor: string
  itens: ItemCotacaoPdf[]
  geradoEm: string
}) {
  const condicoes: [string, string][] = [
    ['Data da cotação', dataCurta(cotacao.data_cotacao)],
    ['Validade', dataCurta(cotacao.validade_cotacao)],
    ['Prazo de entrega', cotacao.prazo_entrega_dias != null ? `${cotacao.prazo_entrega_dias} dias` : '—'],
    ['Prazo de pagamento', cotacao.prazo_pagamento_dias != null ? `${cotacao.prazo_pagamento_dias} dias` : '—'],
    ['Frete fixo', cotacao.frete_fixo ? moeda(cotacao.frete_fixo) : 'grátis'],
    ['Frete grátis acima de', cotacao.frete_gratis_acima ? moeda(cotacao.frete_gratis_acima) : '—'],
    ['Pedido mínimo', cotacao.pedido_minimo ? moeda(cotacao.pedido_minimo) : '—'],
  ]

  // Mesmo cálculo da tela da cotação
  const totalComImpostos = (i: ItemCotacaoPdf) =>
    (i.quantidade ?? 1) * i.preco_unitario * (1 + (i.ipi ?? 0) / 100 + (i.st ?? 0) / 100)

  const colunas: Coluna<ItemCotacaoPdf>[] = [
    { titulo: 'Descrição no arquivo', largura: 190, valor: (i) => i.descricao_original },
    { titulo: 'Insumo', largura: 150, valor: (i) => i.insumo_nome ?? 'sem vínculo' },
    { titulo: 'Emb.', largura: 42, alinhar: 'right', valor: (i) => (i.quantidade_minima ?? i.quantidade ?? '—').toString() },
    { titulo: 'Un.', largura: 30, valor: (i) => i.unidade ?? '—' },
    { titulo: 'Preço unit.', largura: 62, alinhar: 'right', valor: (i) => moeda(i.preco_unitario) },
    {
      titulo: 'Por unid. base',
      largura: 70,
      alinhar: 'right',
      valor: (i) => {
        const p = precoPorUnidadeBase(i.preco_unitario, i.quantidade_minima, i.unidade)
        return precoBase(p.valor, p.base)
      },
    },
    { titulo: 'IPI', largura: 32, alinhar: 'right', valor: (i) => (i.ipi ? `${i.ipi}%` : '—') },
    { titulo: 'ST', largura: 32, alinhar: 'right', valor: (i) => (i.st ? `${i.st}%` : '—') },
    { titulo: 'Total c/ impostos', largura: 72, alinhar: 'right', valor: (i) => moeda(totalComImpostos(i)) },
    { titulo: 'Validade', largura: 50, valor: (i) => dataCurta(i.validade) },
  ]

  return (
    <Document title={`Cotação — ${fornecedor}`} author="Officinal Compras" language="pt-BR">
      <Page size="A4" orientation="landscape" style={estilos.pagina}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Marca />
          <Text style={[estilos.suave, { fontSize: 7.5 }]}>Gerado em {geradoEm}</Text>
        </View>

        <View style={{ marginTop: 14, paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: COR.grafite }}>
          <Text style={estilos.rotulo}>Cotação</Text>
          <Text style={[estilos.titulo, { marginTop: 2 }]}>{fornecedor}</Text>
          {cotacao.arquivo_nome && (
            <Text style={[estilos.suave, { marginTop: 2 }]}>Arquivo original: {cotacao.arquivo_nome}</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginBottom: 14 }}>
          {condicoes.map(([rotulo, valor]) => (
            <View key={rotulo} style={{ width: '25%', marginBottom: 6 }}>
              <Text style={estilos.rotulo}>{rotulo}</Text>
              <Text style={{ marginTop: 1 }}>{valor}</Text>
            </View>
          ))}
        </View>

        <Text style={[estilos.negrito, { fontSize: 10, marginBottom: 4 }]}>{itens.length} item(ns)</Text>
        {itens.length === 0 ? (
          <Text style={estilos.suave}>Nenhum item lançado nesta cotação.</Text>
        ) : (
          <Tabela colunas={colunas} linhas={itens} chave={(i) => i.id} repetirCabecalho />
        )}

        <Rodape texto={`Officinal Compras · Cotação · ${fornecedor}`} />
      </Page>
    </Document>
  )
}
