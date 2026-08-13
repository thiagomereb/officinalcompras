import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { calcularScores, agruparPorInsumo, PESOS_PADRAO, type Pesos, type CandidatoItem } from '@/lib/comparacao'
import { ComparacaoTable } from '@/components/mapas/ComparacaoTable'
import { salvarSelecoes, aprovarMapa, excluirMapa } from '../actions'
import { AprovarMapaButton } from './AprovarMapaButton'
import { ExcluirMapaButton } from './ExcluirMapaButton'

export default async function MapaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Busca o mapa
  const { data: mapaData } = await supabase.from('mapas_cotacao').select('*').eq('id', id).single()
  if (!mapaData) notFound()

  const pesos: Pesos = (mapaData.pesos as Pesos) ?? PESOS_PADRAO
  const aprovado = mapaData.status === 'aprovado' || mapaData.status === 'exportado'

  // Busca cotações + itens + insumos + fornecedores
  const { data: cotacoes } = await supabase
    .from('cotacoes')
    .select('id, prazo_entrega_dias, prazo_pagamento_dias, frete_fixo, frete_gratis_acima, pedido_minimo, fornecedores(razao_social, nome_fantasia)')
    .in('id', mapaData.cotacoes_ids)

  const { data: itensRaw } = await supabase
    .from('cotacao_itens')
    .select('id, cotacao_id, insumo_id, preco_unitario, unidade, quantidade_minima, lote, validade, insumos(nome_padrao)')
    .in('cotacao_id', mapaData.cotacoes_ids)
    .not('insumo_id', 'is', null)

  // Busca seleções salvas
  const { data: selecoesSalvas } = await supabase
    .from('mapa_cotacao_itens')
    .select('insumo_id, cotacao_item_id, quantidade')
    .eq('mapa_id', id)

  // Monta mapa de condições por cotação
  const condicoesPorCotacao = new Map(
    (cotacoes ?? []).map((c) => {
      const f = c.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
      return [c.id, { ...c, fornecedor_nome: f?.nome_fantasia ?? f?.razao_social ?? '—' }]
    })
  )

  // Monta candidatos sem score
  const candidatosSemScore: Omit<CandidatoItem, 'score'>[] = (itensRaw ?? [])
    .filter((item) => item.insumo_id)
    .map((item) => {
      const cond = condicoesPorCotacao.get(item.cotacao_id)
      const insumo = item.insumos as { nome_padrao: string } | null
      return {
        cotacao_item_id: item.id,
        cotacao_id: item.cotacao_id,
        insumo_id: item.insumo_id!,
        insumo_nome: insumo?.nome_padrao ?? 'Desconhecido',
        fornecedor_nome: cond?.fornecedor_nome ?? '—',
        preco_unitario: item.preco_unitario,
        unidade: item.unidade,
        quantidade_minima: item.quantidade_minima,
        lote: item.lote,
        validade: item.validade,
        prazo_entrega_dias: cond?.prazo_entrega_dias ?? null,
        prazo_pagamento_dias: cond?.prazo_pagamento_dias ?? null,
        frete_fixo: cond?.frete_fixo ?? null,
        frete_gratis_acima: cond?.frete_gratis_acima ?? null,
        pedido_minimo: cond?.pedido_minimo ?? null,
      }
    })

  // Calcula scores e agrupa
  const candidatos = calcularScores(candidatosSemScore, pesos)
  const grupos = agruparPorInsumo(candidatos)

  // Detecta grupos duplicados via sinônimos (mesmo insumo, chaves distintas no mapa)
  const insumoIdsNoMapa = grupos.map(g => g.insumo_id)
  const { data: sinonimosNoMapa } = insumoIdsNoMapa.length > 0
    ? await supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', insumoIdsNoMapa)
    : { data: [] as { insumo_id: string; sinonimo: string }[] }

  const sinonimoPorTexto = new Map<string, string>()
  for (const s of sinonimosNoMapa ?? []) {
    sinonimoPorTexto.set(s.sinonimo.trim().toLowerCase(), s.insumo_id)
  }

  type InfoDuplicata = { outroId: string; outroNome: string; eMaisBarato: boolean; diffPct: number }
  const duplicatasInfo: Record<string, InfoDuplicata> = {}

  const melhorPrecoGrupo = (g: (typeof grupos)[0]) =>
    Math.min(...g.candidatos.map(c => c.preco_unitario / Math.max(c.quantidade_minima ?? 1, 1)))

  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      const a = grupos[i]
      const b = grupos[j]
      const aNorm = a.insumo_nome.trim().toLowerCase()
      const bNorm = b.insumo_nome.trim().toLowerCase()
      const aSinoDeB = sinonimoPorTexto.get(aNorm) === b.insumo_id
      const bSinoDeA = sinonimoPorTexto.get(bNorm) === a.insumo_id
      if (!aSinoDeB && !bSinoDeA) continue

      const precoA = a.candidatos.length ? melhorPrecoGrupo(a) : Infinity
      const precoB = b.candidatos.length ? melhorPrecoGrupo(b) : Infinity
      const aEMaisBarato = precoA <= precoB
      const ref = aEMaisBarato ? precoA : precoB
      const diffPct = ref > 0 ? Math.abs(precoA - precoB) / ref * 100 : 0

      duplicatasInfo[a.insumo_id] = { outroId: b.insumo_id, outroNome: b.insumo_nome, eMaisBarato: aEMaisBarato, diffPct }
      duplicatasInfo[b.insumo_id] = { outroId: a.insumo_id, outroNome: a.insumo_nome, eMaisBarato: !aEMaisBarato, diffPct }
    }
  }

  // Seleções salvas indexadas por insumo_id
  const selecoesMapa: Record<string, { cotacao_item_id: string; quantidade: number }> = {}
  for (const s of selecoesSalvas ?? []) {
    selecoesMapa[s.insumo_id] = { cotacao_item_id: s.cotacao_item_id ?? '', quantidade: s.quantidade }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link href="/mapas" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ChevronLeft size={16} />
          Voltar para mapas
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{mapaData.titulo}</h2>
            <p className="text-gray-500 mt-1 text-sm">
              {grupos.length} insumo(s) · {mapaData.cotacoes_ids.length} cotação(ões)
              {aprovado && (
                <span className="ml-3 inline-flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle size={13} /> Aprovado
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            {!aprovado && (
              <AprovarMapaButton id={id} action={aprovarMapa} />
            )}
            <ExcluirMapaButton id={id} action={excluirMapa} />
          </div>
        </div>

        {/* Pesos ativos */}
        <div className="mt-4 flex flex-wrap gap-3">
          {([['Preço', pesos.preco], ['Entrega', pesos.entrega], ['Pagamento', pesos.pagamento], ['Frete', pesos.frete]] as [string, number][]).map(([label, valor]) => (
            <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
              <span className="font-medium">{label}:</span> {valor}%
            </span>
          ))}
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">Nenhum item com insumo vinculado nas cotações selecionadas.</p>
          <p className="text-gray-300 text-xs mt-1">Volte às cotações e vincule os itens à tabela mestre de insumos.</p>
        </div>
      ) : (
        <ComparacaoTable
          grupos={grupos}
          selecoesSalvas={selecoesMapa}
          mapaId={id}
          aprovado={aprovado}
          onSalvar={salvarSelecoes}
          duplicatasInfo={duplicatasInfo}
        />
      )}
    </div>
  )
}
