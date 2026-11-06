import { createClient } from '@/lib/supabase/server'
import { buscarTodos } from '@/lib/supabase/consultas'
import { compararOfertas, agruparPorInsumo, type CandidatoItem, type OfertaCotacao } from '@/lib/comparacao'
import { Indicadores } from '@/components/dashboard/Indicadores'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { ComparativoTable, type ComparativoRow } from '@/components/dashboard/ComparativoTable'
import { PriceHistoryChart, type PricePoint } from '@/components/dashboard/PriceHistoryChart'
import { AlertasPanel, type Alerta } from '@/components/dashboard/AlertasPanel'
import { RankingFornecedores, type RankingItem } from '@/components/dashboard/RankingFornecedores'
import { Plus } from 'lucide-react'
import Link from 'next/link'

type CotacaoDoItem = {
  id: string
  prazo_entrega_dias: number | null
  prazo_pagamento_dias: number | null
  frete_fixo: number | null
  frete_gratis_acima: number | null
  pedido_minimo: number | null
  data_cotacao: string
  validade_cotacao: string | null
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null
}

// O servidor roda em UTC; sem fixar o fuso, depois das 21h o "hoje" já seria amanhã
const FUSO = 'America/Sao_Paulo'

function dataISO(d: Date) {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d)
}

// Dois candidatos mais baratos de fornecedores diferentes. O grupo já vem do
// menor para o maior preço por unidade base, com o que não dá para comparar
// (R$/un num grupo em R$/g) no fim.
function doisMaisBaratos(candidatos: CandidatoItem[]): [CandidatoItem, CandidatoItem | null] {
  const melhor = candidatos[0]
  const segundo =
    candidatos.find((c) => c.preco_comparavel && c.fornecedor_nome !== melhor.fornecedor_nome) ?? null
  return [melhor, segundo]
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const agora = new Date()
  const today = dataISO(agora)
  const in7Days = dataISO(new Date(agora.getTime() + 7 * 86_400_000))
  // Primeiro dia do mês em Brasília (UTC-3)
  const inicioMes = `${today.slice(0, 8)}01T00:00:00-03:00`

  const [
    { count: totalInsumos },
    rawItems,
    { data: cotacoesVencendo },
    comprasMes,
  ] = await Promise.all([
    supabase.from('insumos').select('*', { count: 'exact', head: true }),
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_itens')
        .select(
          `id, cotacao_id, insumo_id, preco_unitario, unidade, quantidade_minima, lote, validade,
           cotacoes(id, prazo_entrega_dias, prazo_pagamento_dias, frete_fixo, frete_gratis_acima, pedido_minimo, data_cotacao, validade_cotacao, fornecedores(razao_social, nome_fantasia)),
           insumos(nome_padrao)`,
        )
        .not('insumo_id', 'is', null)
        .not('preco_unitario', 'is', null)
        .order('id')
        .range(de, ate),
    ),
    supabase
      .from('cotacoes')
      .select('id, validade_cotacao, fornecedores(razao_social, nome_fantasia)')
      .not('validade_cotacao', 'is', null)
      .gte('validade_cotacao', today)
      .lte('validade_cotacao', in7Days),
    buscarTodos((de, ate) =>
      supabase
        .from('historico_compras')
        .select('id, mapa_id, valor_total')
        .gte('aprovado_em', inicioMes)
        .order('id')
        .range(de, ate),
    ),
  ])

  const valorComprasMes = comprasMes.reduce((soma, c) => soma + (c.valor_total ?? 0), 0)
  const mapasNoMes = new Set(comprasMes.map((c) => c.mapa_id)).size

  const itemPorId = new Map(rawItems.map((r) => [r.id, r]))
  const dataDoItem = (id: string) => (itemPorId.get(id)?.cotacoes as CotacaoDoItem | null)?.data_cotacao ?? ''

  const ofertas: OfertaCotacao[] = rawItems.map((item) => {
    const cot = item.cotacoes as CotacaoDoItem | null
    const insumo = item.insumos as { nome_padrao: string } | null
    const forn = cot?.fornecedores
    return {
      cotacao_item_id: item.id,
      cotacao_id: item.cotacao_id,
      insumo_id: item.insumo_id!,
      insumo_nome: insumo?.nome_padrao ?? '—',
      fornecedor_nome: forn?.nome_fantasia ?? forn?.razao_social ?? '—',
      preco_unitario: item.preco_unitario,
      unidade: item.unidade,
      quantidade_minima: item.quantidade_minima,
      lote: item.lote,
      validade: item.validade,
      prazo_entrega_dias: cot?.prazo_entrega_dias ?? null,
      prazo_pagamento_dias: cot?.prazo_pagamento_dias ?? null,
      frete_fixo: cot?.frete_fixo ?? null,
      frete_gratis_acima: cot?.frete_gratis_acima ?? null,
      pedido_minimo: cot?.pedido_minimo ?? null,
    }
  })

  // A comparação usa só ofertas vigentes: cotação vencida não é preço que dá
  // para comprar hoje. E de cada fornecedor vale a cotação mais recente do
  // insumo, senão o histórico dele concorreria consigo mesmo.
  const vigentes = ofertas.filter((c) => {
    const validade = (itemPorId.get(c.cotacao_item_id)?.cotacoes as CotacaoDoItem | null)?.validade_cotacao
    return !validade || validade >= today
  })
  const maisRecente = new Map<string, OfertaCotacao>()
  for (const c of vigentes) {
    const chave = `${c.insumo_id}|${c.fornecedor_nome}`
    const atual = maisRecente.get(chave)
    if (!atual || dataDoItem(c.cotacao_item_id) > dataDoItem(atual.cotacao_item_id)) maisRecente.set(chave, c)
  }

  const grupos = agruparPorInsumo(compararOfertas([...maisRecente.values()]))

  // Comparativo rows — preço sempre na unidade base, para embalagens diferentes
  // serem comparáveis
  const comparativoRows: ComparativoRow[] = grupos.map((g) => {
    const [melhor, segundo] = doisMaisBaratos(g.candidatos)
    return {
      insumo_id: g.insumo_id,
      insumo_nome: g.insumo_nome,
      melhor_fornecedor: melhor.fornecedor_nome,
      melhor_cotacao_id: melhor.cotacao_id,
      melhor_preco: melhor.preco_base,
      segundo_preco: segundo?.preco_base ?? null,
      diferenca_pct: segundo ? (segundo.preco_base / melhor.preco_base - 1) * 100 : null,
      prazo_entrega: melhor.prazo_entrega_dias,
      validade: melhor.validade,
      unidade: melhor.unidade_base,
    }
  })

  // KPIs
  const comConcorrencia = comparativoRows.filter((r) => r.segundo_preco != null)
  const insumosComMultiplos = comConcorrencia.length

  // Sem as quantidades compradas não dá para falar em R$ economizados; o que
  // os dados sustentam é quanto o 2º menor preço custa a mais, em média.
  const economiaMediaPct = comConcorrencia.length
    ? comConcorrencia.reduce((acc, r) => acc + (1 - r.melhor_preco / r.segundo_preco!) * 100, 0) /
      comConcorrencia.length
    : null

  // Ranking: em quantos insumos cada fornecedor tem o menor preço
  const winCount = new Map<string, number>()
  grupos.forEach((g) => {
    const best = g.candidatos[0]
    winCount.set(best.fornecedor_nome, (winCount.get(best.fornecedor_nome) ?? 0) + 1)
  })
  const rankingItems: RankingItem[] = [...winCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, wins]) => ({ nome, wins, total: grupos.length }))


  // Alerts
  const alertas: Alerta[] = []
  for (const cot of cotacoesVencendo ?? []) {
    const f = cot.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
    const nome = f?.nome_fantasia ?? f?.razao_social ?? 'Fornecedor'
    alertas.push({
      tipo: 'vencimento',
      mensagem: `Cotação de ${nome} vence em breve`,
      detalhe: `Validade: ${new Date(cot.validade_cotacao! + 'T12:00:00').toLocaleDateString('pt-BR')}`,
    })
  }
  const insumosUnico = grupos.filter(
    (g) => new Set(g.candidatos.map((c) => c.fornecedor_nome)).size === 1,
  ).length
  if (insumosUnico > 0) {
    alertas.push({
      tipo: 'unico_fornecedor',
      mensagem: `${insumosUnico} insumo(s) com apenas 1 fornecedor`,
      detalhe: 'Recomenda-se buscar cotações adicionais',
    })
  }

  // Price history — usa todo o histórico (inclusive vencidas) do insumo com
  // mais fornecedores
  let priceHistoryData: PricePoint[] = []
  let priceHistoryFornecedores: string[] = []
  let priceHistoryInsumo: string | undefined
  let priceHistoryUnidade: string | null = null

  if (grupos.length > 0) {
    const topGrupo = grupos.reduce((max, g) =>
      new Set(g.candidatos.map((c) => c.fornecedor_nome)).size > new Set(max.candidatos.map((c) => c.fornecedor_nome)).size ? g : max,
    )
    priceHistoryInsumo = topGrupo.insumo_nome

    const historico = compararOfertas(ofertas.filter((c) => c.insumo_id === topGrupo.insumo_id)).filter(
      (c) => c.preco_comparavel,
    )
    priceHistoryUnidade = historico[0]?.unidade_base ?? null

    const byDate = new Map<string, Record<string, number>>()
    historico.forEach((c) => {
      const date = dataDoItem(c.cotacao_item_id) || 'sem data'
      if (!byDate.has(date)) byDate.set(date, {})
      const entry = byDate.get(date)!
      if (entry[c.fornecedor_nome] == null || c.preco_base < entry[c.fornecedor_nome]) {
        entry[c.fornecedor_nome] = c.preco_base
      }
    })

    priceHistoryFornecedores = [...new Set(historico.map((c) => c.fornecedor_nome))]
    priceHistoryData = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({ date, ...prices }))
  }

  const dateLabel = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: FUSO,
  })
  // Só a primeira letra: o capitalize do CSS faria "Segunda-Feira, 2 De Novembro"
  const dataCabecalho = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Compras"
        titulo="Painel"
        descricao={dataCabecalho}
        acoes={
          <Link href="/cotacoes/nova" className="btn btn-primario">
            <Plus size={16} />
            Nova cotação
          </Link>
        }
      />

      <Indicadores
        itens={[
          {
            rotulo: 'Economia potencial',
            valor: economiaMediaPct != null ? `${economiaMediaPct.toFixed(1).replace('.', ',')}%` : '—',
            detalhe: 'média frente ao 2º menor preço',
          },
          {
            rotulo: 'Insumos comparados',
            valor: insumosComMultiplos.toLocaleString('pt-BR'),
            detalhe: `com 2+ fornecedores, de ${(totalInsumos ?? 0).toLocaleString('pt-BR')} cadastrados`,
          },
          {
            rotulo: 'Compras no mês',
            valor: valorComprasMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }),
            detalhe: comprasMes.length
              ? `${comprasMes.length} item(ns) em ${mapasNoMes} mapa(s) aprovado(s)`
              : 'nenhum mapa aprovado este mês',
          },
          {
            rotulo: 'Alertas',
            valor: String(alertas.length),
            alerta: alertas.length > 0,
            detalhe: alertas.length > 0 ? 'veja a lista abaixo' : 'nada pendente',
          },
        ]}
      />

      <ComparativoTable rows={comparativoRows} />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PriceHistoryChart
          data={priceHistoryData}
          fornecedores={priceHistoryFornecedores}
          insumoNome={priceHistoryInsumo}
          unidade={priceHistoryUnidade}
        />
        <AlertasPanel alertas={alertas} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RankingFornecedores items={rankingItems} />
      </div>
    </div>
  )
}
