import { notFound } from 'next/navigation'
import { GitCompare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PESOS_PADRAO, type Pesos } from '@/lib/comparacao'
import { carregarGruposMapa } from '@/lib/mapas'
import { ComparacaoTable } from '@/components/mapas/ComparacaoTable'
import { salvarSelecoes, aprovarMapa, excluirMapa } from '../actions'
import { AprovarMapaButton } from './AprovarMapaButton'
import { ExcluirMapaButton } from './ExcluirMapaButton'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

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

  const criterios: [string, number][] = [
    ['Preço', pesos.preco],
    ['Entrega', pesos.entrega],
    ['Pagamento', pesos.pagamento],
    ['Frete', pesos.frete],
  ]

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/mapas', label: 'Mapas de cotação' }}
        grupo="Mapa de cotação"
        titulo={mapaData.titulo}
        descricao={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {grupos.length} insumo(s) · {mapaData.cotacoes_ids.length} cotação(ões)
            </span>
            <span className={`selo ${aprovado ? 'selo-ok' : ''}`}>{aprovado ? 'Aprovado' : 'Rascunho'}</span>
          </span>
        }
        acoes={
          <>
            {!aprovado && <AprovarMapaButton id={id} action={aprovarMapa} />}
            <ExcluirMapaButton id={id} action={excluirMapa} />
          </>
        }
      />

      <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ardosia">
        <span className="rotulo">Pesos</span>
        {criterios.map(([label, valor]) => (
          <span key={label}>
            {label} <span className="leitura text-grafite">{valor}%</span>
          </span>
        ))}
      </p>

      {grupos.length === 0 ? (
        <Vazio
          icone={GitCompare}
          titulo="Nenhum item vinculado nas cotações deste mapa"
          texto="A comparação é feita por insumo. Abra as cotações e vincule os itens à tabela de insumos."
        />
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
