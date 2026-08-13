import { createClient } from '@/lib/supabase/server'
import { calcularScores, agruparPorInsumo, PESOS_PADRAO, type CandidatoItem } from '@/lib/comparacao'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { ComparativoTable, type ComparativoRow } from '@/components/dashboard/ComparativoTable'
import { PriceHistoryChart, type PricePoint } from '@/components/dashboard/PriceHistoryChart'
import { AlertasPanel, type Alerta } from '@/components/dashboard/AlertasPanel'
import { RankingFornecedores, type RankingItem } from '@/components/dashboard/RankingFornecedores'
import { AbcChart, type AbcData } from '@/components/dashboard/AbcChart'
import { TrendingDown, Package, Building2, Bell } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { count: totalFornecedores },
    { count: totalInsumos },
    { data: rawItems },
    { data: cotacoesVencendo },
  ] = await Promise.all([
    supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('insumos').select('*', { count: 'exact', head: true }),
    supabase
      .from('cotacao_itens')
      .select(
        `id, cotacao_id, insumo_id, preco_unitario, unidade, quantidade_minima, lote, validade,
         cotacoes(id, prazo_entrega_dias, prazo_pagamento_dias, frete_fixo, frete_gratis_acima, pedido_minimo, data_cotacao, validade_cotacao, fornecedores(razao_social, nome_fantasia)),
         insumos(nome_padrao, cas_number)`,
      )
      .not('insumo_id', 'is', null)
      .not('preco_unitario', 'is', null),
    supabase
      .from('cotacoes')
      .select('id, validade_cotacao, fornecedores(razao_social, nome_fantasia)')
      .not('validade_cotacao', 'is', null)
      .gte('validade_cotacao', today)
      .lte('validade_cotacao', in7Days),
  ])

  // Build candidatos for scoring
  const candidatosSemScore: Omit<CandidatoItem, 'score'>[] = (rawItems ?? []).map((item) => {
    const cot = item.cotacoes as {
      id: string
      prazo_entrega_dias: number | null
      prazo_pagamento_dias: number | null
      frete_fixo: number | null
      frete_gratis_acima: number | null
      pedido_minimo: number | null
      data_cotacao: string
      validade_cotacao: string | null
      fornecedores: { razao_social: string; nome_fantasia: string | null } | null
    } | null
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

  const candidatos = calcularScores(candidatosSemScore, PESOS_PADRAO)
  const grupos = agruparPorInsumo(candidatos)

  // Comparativo rows
  const comparativoRows: ComparativoRow[] = grupos.map((g) => {
    const sorted = [...g.candidatos].sort((a, b) => b.score - a.score)
    const best = sorted[0]
    const second = sorted[1]
    const rawItem = (rawItems ?? []).find((r) => r.id === best.cotacao_item_id)
    const insumo = rawItem?.insumos as { nome_padrao: string; cas_number: string | null } | null
    const diferenca =
      second != null
        ? ((second.preco_unitario - best.preco_unitario) / best.preco_unitario) * 100
        : null

    return {
      insumo_id: g.insumo_id,
      insumo_nome: g.insumo_nome,
      cas_number: insumo?.cas_number ?? null,
      melhor_fornecedor: best.fornecedor_nome,
      melhor_cotacao_id: best.cotacao_id,
      melhor_preco: best.preco_unitario,
      segundo_preco: second?.preco_unitario ?? null,
      diferenca_pct: diferenca,
      prazo_entrega: best.prazo_entrega_dias,
      validade: best.validade,
      score: best.score,
      unidade: best.unidade,
    }
  })

  // KPIs
  const insumosComMultiplos = grupos.filter(
    (g) => new Set(g.candidatos.map((c) => c.fornecedor_nome)).size >= 2,
  ).length

  const economiaTotal = comparativoRows.reduce((acc, r) => {
    if (r.diferenca_pct != null && r.segundo_preco != null) return acc + (r.segundo_preco - r.melhor_preco)
    return acc
  }, 0)

  // Supplier ranking (by number of wins = best score on insumo)
  const winCount = new Map<string, number>()
  grupos.forEach((g) => {
    const best = g.candidatos.reduce((a, b) => (a.score > b.score ? a : b))
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

  // ABC analysis — classified by price rank
  const sorted = [...comparativoRows].sort((a, b) => b.melhor_preco - a.melhor_preco)
  const totalInsumosCot = sorted.length
  const aCount = Math.round(totalInsumosCot * 0.2)
  const bCount = Math.round(totalInsumosCot * 0.3)
  const cCount = Math.max(0, totalInsumosCot - aCount - bCount)
  const abcData: AbcData[] = [
    { categoria: 'A' as const, count: aCount, pct: totalInsumosCot > 0 ? (aCount / totalInsumosCot) * 100 : 0 },
    { categoria: 'B' as const, count: bCount, pct: totalInsumosCot > 0 ? (bCount / totalInsumosCot) * 100 : 0 },
    { categoria: 'C' as const, count: cCount, pct: totalInsumosCot > 0 ? (cCount / totalInsumosCot) * 100 : 0 },
  ].filter((d) => d.count > 0)

  // Price history — find group with most distinct suppliers
  let priceHistoryData: PricePoint[] = []
  let priceHistoryFornecedores: string[] = []
  let priceHistoryInsumo: string | undefined

  if (grupos.length > 0) {
    const topGrupo = grupos.reduce((max, g) => {
      const s = new Set(g.candidatos.map((c) => c.fornecedor_nome)).size
      const ms = new Set(max.candidatos.map((c) => c.fornecedor_nome)).size
      return s > ms ? g : max
    })
    priceHistoryInsumo = topGrupo.insumo_nome

    const byDate = new Map<string, Record<string, number>>()
    topGrupo.candidatos.forEach((c) => {
      const ri = (rawItems ?? []).find((r) => r.id === c.cotacao_item_id)
      const cot = ri?.cotacoes as { data_cotacao: string } | null
      const date = cot?.data_cotacao ?? 'sem data'
      if (!byDate.has(date)) byDate.set(date, {})
      const entry = byDate.get(date)!
      if (entry[c.fornecedor_nome] == null || c.preco_unitario < entry[c.fornecedor_nome]) {
        entry[c.fornecedor_nome] = c.preco_unitario
      }
    })

    priceHistoryFornecedores = [...new Set(topGrupo.candidatos.map((c) => c.fornecedor_nome))]
    priceHistoryData = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({ date, ...prices }))
  }

  // Sparkline seeds (decorative)
  const spark = (seed: number, len = 8) =>
    Array.from({ length: len }, (_, i) => 40 + seed * 8 + Math.sin(i * 0.9 + seed) * 12 + i * (seed % 2 === 0 ? -1.2 : 0.8))

  const dateLabel = new Date().toLocaleDateString('pt-BR', {
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
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 transition-colors relative">
            <Bell size={17} />
            {alertas.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
          <Link
            href="/cotacoes/nova"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Nova Cotação
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Economia Potencial"
          value={economiaTotal > 0 ? `R$ ${economiaTotal.toFixed(2)}` : '—'}
          subtitle="vs. 2º melhor preço"
          color="green"
          trendLabel={economiaTotal > 0 ? 'disponível' : undefined}
          sparkData={spark(0)}
          icon={<TrendingDown size={18} />}
        />
        <KpiCard
          title="Insumos Analisados"
          value={String(insumosComMultiplos)}
          subtitle={`de ${totalInsumos ?? 0} cadastrados`}
          color="blue"
          sparkData={spark(1)}
          icon={<Package size={18} />}
        />
        <KpiCard
          title="Fornecedor Líder"
          value={topFornecedor.length > 14 ? topFornecedor.slice(0, 12) + '…' : topFornecedor}
          subtitle={rankingItems[0] ? `${rankingItems[0].wins} itens mais baratos` : 'sem dados'}
          color="amber"
          icon={<Building2 size={18} />}
        />
        <KpiCard
          title="Alertas Ativos"
          value={String(alertas.length)}
          subtitle={alertas.length > 0 ? 'requer atenção' : 'tudo em ordem'}
          color={alertas.length > 0 ? 'red' : 'green'}
          sparkData={spark(3)}
          icon={<Bell size={18} />}
        />
      </div>

      {/* Main comparison table */}
      <ComparativoTable rows={comparativoRows} />

      {/* Bottom panels — row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PriceHistoryChart
          data={priceHistoryData}
          fornecedores={priceHistoryFornecedores}
          insumoNome={priceHistoryInsumo}
        />
        <AlertasPanel alertas={alertas} />
      </div>

      {/* Bottom panels — row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingFornecedores items={rankingItems} />
        <AbcChart data={abcData} />
      </div>
    </div>
  )
}
