import { createClient } from '@/lib/supabase/server'
import { buscarTodos } from '@/lib/supabase/consultas'
import { calcularScores, agruparPorInsumo, PESOS_PADRAO, type CandidatoItem, type CandidatoSemScore } from '@/lib/comparacao'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { ComparativoTable, type ComparativoRow } from '@/components/dashboard/ComparativoTable'
import { PriceHistoryChart, type PricePoint } from '@/components/dashboard/PriceHistoryChart'
import { AlertasPanel, type Alerta } from '@/components/dashboard/AlertasPanel'
import { RankingFornecedores, type RankingItem } from '@/components/dashboard/RankingFornecedores'
import { TrendingDown, Package, Building2, Bell } from 'lucide-react'
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

function dataLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Dois candidatos mais baratos de fornecedores diferentes, comparando só preços
// na mesma unidade base (R$/g não se compara com R$/un)
function doisMaisBaratos(candidatos: CandidatoItem[]): [CandidatoItem, CandidatoItem | null] {
  const comparaveis = candidatos.filter((c) => c.preco_comparavel)
  const ordenados = [...(comparaveis.length ? comparaveis : candidatos)].sort((a, b) => a.preco_base - b.preco_base)
  const melhor = ordenados[0]
  const segundo = ordenados.find((c) => c.fornecedor_nome !== melhor.fornecedor_nome) ?? null
  return [melhor, segundo]
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const agora = new Date()
  const today = dataLocalISO(agora)
  const em7Dias = new Date(agora)
  em7Dias.setDate(em7Dias.getDate() + 7)
  const in7Days = dataLocalISO(em7Dias)

  const [
    { count: totalInsumos },
    rawItems,
    { data: cotacoesVencendo },
  ] = await Promise.all([
    supabase.from('insumos').select('*', { count: 'exact', head: true }),
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_itens')
        .select(
          `id, cotacao_id, insumo_id, preco_unitario, unidade, quantidade_minima, lote, validade,
           cotacoes(id, prazo_entrega_dias, prazo_pagamento_dias, frete_fixo, frete_gratis_acima, pedido_minimo, data_cotacao, validade_cotacao, fornecedores(razao_social, nome_fantasia)),
           insumos(nome_padrao, cas_number)`,
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
  ])

  const itemPorId = new Map(rawItems.map((r) => [r.id, r]))
  const casPorInsumo = new Map(
    rawItems.map((r) => [r.insumo_id!, (r.insumos as { cas_number: string | null } | null)?.cas_number ?? null]),
  )
  const dataDoItem = (id: string) => (itemPorId.get(id)?.cotacoes as CotacaoDoItem | null)?.data_cotacao ?? ''

  const candidatosSemScore: CandidatoSemScore[] = rawItems.map((item) => {
    const cot = item.cotacoes as CotacaoDoItem | null
    const insumo = item.insumos as { nome_padrao: string; cas_number: string | null } | null
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
  const vigentes = candidatosSemScore.filter((c) => {
    const validade = (itemPorId.get(c.cotacao_item_id)?.cotacoes as CotacaoDoItem | null)?.validade_cotacao
    return !validade || validade >= today
  })
  const maisRecente = new Map<string, CandidatoSemScore>()
  for (const c of vigentes) {
    const chave = `${c.insumo_id}|${c.fornecedor_nome}`
    const atual = maisRecente.get(chave)
    if (!atual || dataDoItem(c.cotacao_item_id) > dataDoItem(atual.cotacao_item_id)) maisRecente.set(chave, c)
  }

  const grupos = agruparPorInsumo(calcularScores([...maisRecente.values()], PESOS_PADRAO))

  // Comparativo rows — preço sempre na unidade base, para embalagens diferentes
  // serem comparáveis
  const comparativoRows: ComparativoRow[] = grupos.map((g) => {
    const [melhor, segundo] = doisMaisBaratos(g.candidatos)
    return {
      insumo_id: g.insumo_id,
      insumo_nome: g.insumo_nome,
      cas_number: casPorInsumo.get(g.insumo_id) ?? null,
      melhor_fornecedor: melhor.fornecedor_nome,
      melhor_cotacao_id: melhor.cotacao_id,
      melhor_preco: melhor.preco_base,
      segundo_preco: segundo?.preco_base ?? null,
      diferenca_pct: segundo ? (segundo.preco_base / melhor.preco_base - 1) * 100 : null,
      prazo_entrega: melhor.prazo_entrega_dias,
      validade: melhor.validade,
      score: melhor.score,
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

  // Supplier ranking (by number of wins = best score on insumo)
  const winCount = new Map<string, number>()
  grupos.forEach((g) => {
    const best = g.candidatos[0]
    winCount.set(best.fornecedor_nome, (winCount.get(best.fornecedor_nome) ?? 0) + 1)
  })
  const rankingItems: RankingItem[] = [...winCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, wins]) => ({ nome, wins, total: grupos.length }))

  const topFornecedor = rankingItems[0]?.nome ?? '—'

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

    const historico = calcularScores(
      candidatosSemScore.filter((c) => c.insumo_id === topGrupo.insumo_id),
      PESOS_PADRAO,
    ).filter((c) => c.preco_comparavel)
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
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{dateLabel}</p>
        </div>
        <Link
          href="/cotacoes/nova"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nova Cotação
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Economia Potencial"
          value={economiaMediaPct != null ? `${economiaMediaPct.toFixed(1).replace('.', ',')}%` : '—'}
          subtitle="média vs. 2º menor preço"
          color="green"
          icon={<TrendingDown size={18} />}
        />
        <KpiCard
          title="Insumos Analisados"
          value={String(insumosComMultiplos)}
          subtitle={`com 2+ fornecedores, de ${totalInsumos ?? 0} cadastrados`}
          color="blue"
          icon={<Package size={18} />}
        />
        <KpiCard
          title="Fornecedor Líder"
          value={topFornecedor.length > 14 ? topFornecedor.slice(0, 12) + '…' : topFornecedor}
          subtitle={rankingItems[0] ? `melhor score em ${rankingItems[0].wins} insumo(s)` : 'sem dados'}
          color="amber"
          icon={<Building2 size={18} />}
        />
        <KpiCard
          title="Alertas Ativos"
          value={String(alertas.length)}
          subtitle={alertas.length > 0 ? 'requer atenção' : 'tudo em ordem'}
          color={alertas.length > 0 ? 'red' : 'green'}
          icon={<Bell size={18} />}
        />
      </div>

      {/* Main comparison table */}
      <ComparativoTable rows={comparativoRows} />

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PriceHistoryChart
          data={priceHistoryData}
          fornecedores={priceHistoryFornecedores}
          insumoNome={priceHistoryInsumo}
          unidade={priceHistoryUnidade}
        />
        <AlertasPanel alertas={alertas} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingFornecedores items={rankingItems} />
      </div>
    </div>
  )
}
