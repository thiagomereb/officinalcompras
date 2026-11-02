import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PESOS_PADRAO, type Pesos } from '@/lib/comparacao'
import { carregarGruposMapa } from '@/lib/mapas'
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

  const [grupos, { data: selecoesSalvas }] = await Promise.all([
    carregarGruposMapa(supabase, mapaData.cotacoes_ids, pesos),
    supabase
      .from('mapa_cotacao_itens')
      .select('insumo_id, cotacao_item_id, quantidade')
      .eq('mapa_id', id),
  ])

  // Detecta grupos duplicados via sinônimos (mesmo insumo, chaves distintas no mapa)
  const insumoIdsNoMapa = grupos.map(g => g.insumo_id)
  const { data: sinonimosNoMapa } = insumoIdsNoMapa.length > 0
    ? await supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', insumoIdsNoMapa)
    : { data: [] as { insumo_id: string; sinonimo: string }[] }

  type InfoDuplicata = { outroId: string; outroNome: string; eMaisBarato: boolean; diffPct: number }
  const duplicatasInfo: Record<string, InfoDuplicata> = {}

  // Compara pelo preço na unidade base, o mesmo usado no score
  const melhorPrecoGrupo = (g: (typeof grupos)[0]) =>
    g.candidatos.length ? Math.min(...g.candidatos.map(c => c.preco_base)) : Infinity

  // Um grupo é duplicata de outro quando o nome de um aparece como sinônimo do outro
  const grupoPorNome = new Map(grupos.map(g => [g.insumo_nome.trim().toLowerCase(), g]))
  const grupoPorId = new Map(grupos.map(g => [g.insumo_id, g]))
  for (const s of sinonimosNoMapa ?? []) {
    const a = grupoPorNome.get(s.sinonimo.trim().toLowerCase())
    const b = grupoPorId.get(s.insumo_id)
    if (!a || !b || a.insumo_id === b.insumo_id) continue

    const precoA = melhorPrecoGrupo(a)
    const precoB = melhorPrecoGrupo(b)
    const aEMaisBarato = precoA <= precoB
    const ref = aEMaisBarato ? precoA : precoB
    const diffPct = ref > 0 && Number.isFinite(ref) ? Math.abs(precoA - precoB) / ref * 100 : 0

    duplicatasInfo[a.insumo_id] = { outroId: b.insumo_id, outroNome: b.insumo_nome, eMaisBarato: aEMaisBarato, diffPct }
    duplicatasInfo[b.insumo_id] = { outroId: a.insumo_id, outroNome: a.insumo_nome, eMaisBarato: !aEMaisBarato, diffPct }
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
