import { notFound } from 'next/navigation'
import { GitCompare, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PESOS_PADRAO, type GrupoInsumo, type Pesos } from '@/lib/comparacao'
import { carregarGruposMapa, carregarUltimasCompras, type UltimaCompra } from '@/lib/mapas'
import { ehComparacaoCongelada } from '@/lib/compras'
import { emLotes } from '@/lib/supabase/consultas'
import { ComparacaoTable, type EscolhaSalva } from '@/components/mapas/ComparacaoTable'
import { salvarSelecoes, aprovarMapa, cancelarMapa, excluirMapa } from '../actions'
import { ExcluirMapaButton } from './ExcluirMapaButton'
import { CancelarMapaButton } from './CancelarMapaButton'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const STATUS = {
  rascunho: { label: 'Rascunho', cls: '' },
  aprovado: { label: 'Aprovado', cls: 'selo-ok' },
  exportado: { label: 'Exportado', cls: 'selo-ok' },
  cancelado: { label: 'Cancelado', cls: 'selo-alerta' },
} as const

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

type InfoDuplicata = { outroId: string; outroNome: string; eMaisBarato: boolean; diffPct: number }

// Um grupo é duplicata de outro quando o nome de um aparece como sinônimo do
// outro (ex: "Cafeína" e "Cafeína anidra" cadastrados como insumos distintos)
function detectarDuplicatas(grupos: GrupoInsumo[], sinonimos: { insumo_id: string; sinonimo: string }[]) {
  const duplicatas: Record<string, InfoDuplicata> = {}
  // Compara pelo preço na unidade base, o mesmo usado no score
  const melhorPreco = (g: GrupoInsumo) => (g.candidatos.length ? Math.min(...g.candidatos.map((c) => c.preco_base)) : Infinity)
  const grupoPorNome = new Map(grupos.map((g) => [g.insumo_nome.trim().toLowerCase(), g]))
  const grupoPorId = new Map(grupos.map((g) => [g.insumo_id, g]))

  for (const s of sinonimos) {
    const a = grupoPorNome.get(s.sinonimo.trim().toLowerCase())
    const b = grupoPorId.get(s.insumo_id)
    if (!a || !b || a.insumo_id === b.insumo_id) continue

    const precoA = melhorPreco(a)
    const precoB = melhorPreco(b)
    const aEMaisBarato = precoA <= precoB
    const ref = aEMaisBarato ? precoA : precoB
    const diffPct = ref > 0 && Number.isFinite(ref) ? (Math.abs(precoA - precoB) / ref) * 100 : 0

    duplicatas[a.insumo_id] = { outroId: b.insumo_id, outroNome: b.insumo_nome, eMaisBarato: aEMaisBarato, diffPct }
    duplicatas[b.insumo_id] = { outroId: a.insumo_id, outroNome: a.insumo_nome, eMaisBarato: !aEMaisBarato, diffPct }
  }
  return duplicatas
}

export default async function MapaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mapa } = await supabase.from('mapas_cotacao').select('*').eq('id', id).single()
  if (!mapa) notFound()

  const rascunho = mapa.status === 'rascunho'
  const congelada = ehComparacaoCongelada(mapa.comparacao) ? mapa.comparacao : null
  const pesos: Pesos = congelada?.pesos ?? (mapa.pesos as Pesos | null) ?? PESOS_PADRAO
  const status = STATUS[mapa.status as keyof typeof STATUS] ?? STATUS.rascunho

  // Aprovado: desenha a comparação como estava na aprovação. Rascunho (ou
  // aprovado antes do registro congelado existir): calcula com os dados atuais.
  const [grupos, { data: escolhasRows }] = await Promise.all([
    congelada && !rascunho ? Promise.resolve(congelada.grupos) : carregarGruposMapa(supabase, mapa.cotacoes_ids, pesos),
    supabase
      .from('mapa_cotacao_itens')
      .select('insumo_id, cotacao_item_id, quantidade, quantidade_unidade')
      .eq('mapa_id', id),
  ])

  const insumoIds = grupos.map((g) => g.insumo_id)
  const [sinonimos, ultimasCompras] = await Promise.all([
    emLotes(insumoIds, (lote) => supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', lote)),
    // Referência de preço só serve enquanto o comprador decide
    rascunho ? carregarUltimasCompras(supabase, insumoIds) : Promise.resolve({} as Record<string, UltimaCompra>),
  ])

  const escolhasSalvas: Record<string, EscolhaSalva> = {}
  for (const e of escolhasRows ?? []) {
    if (!e.cotacao_item_id) continue
    escolhasSalvas[e.insumo_id] = {
      cotacao_item_id: e.cotacao_item_id,
      quantidade: e.quantidade,
      quantidade_unidade: e.quantidade_unidade,
    }
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
        titulo={mapa.titulo}
        descricao={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {grupos.length} insumo(s) · {mapa.cotacoes_ids.length} cotação(ões)
            </span>
            <span className={`selo ${status.cls}`}>{status.label}</span>
          </span>
        }
        acoes={
          rascunho ? (
            <ExcluirMapaButton id={id} action={excluirMapa} />
          ) : mapa.status !== 'cancelado' ? (
            <CancelarMapaButton id={id} action={cancelarMapa} />
          ) : undefined
        }
      />

      {mapa.aprovado_em && (
        <p className="mb-2 text-[13px] text-ardosia">
          Aprovado em <span className="text-grafite">{dataHora(mapa.aprovado_em)}</span>
          {mapa.aprovado_por && (
            <>
              {' '}por <span className="text-grafite">{mapa.aprovado_por}</span>
            </>
          )}
          {mapa.valor_total != null && (
            <>
              {' · '}valor total <span className="leitura font-medium text-grafite">{moeda(mapa.valor_total)}</span>
            </>
          )}
        </p>
      )}

      {mapa.status === 'cancelado' && (
        <p className="aviso aviso-erro mb-4" role="status">
          <Ban size={15} className="mt-0.5 shrink-0" />
          <span>
            Cancelado
            {mapa.cancelado_em && <> em {dataHora(mapa.cancelado_em)}</>}
            {mapa.cancelado_por && <> por {mapa.cancelado_por}</>}. Motivo: {mapa.motivo_cancelamento ?? '—'}. Não entra no
            histórico de compras.
          </span>
        </p>
      )}

      {!rascunho && !congelada && (
        <p className="aviso aviso-atencao mb-4" role="status">
          Este mapa foi aprovado antes de o sistema guardar a comparação da aprovação. A tabela abaixo usa os dados atuais
          das cotações; fornecedor, preço e embalagem escolhidos estão registrados no histórico de compras.
        </p>
      )}

      <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ardosia">
        <span className="rotulo">Pesos da sugestão</span>
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
          // Remonta ao aprovar/cancelar: o estado de edição não vale para o modo leitura
          key={mapa.status}
          grupos={grupos}
          escolhasSalvas={escolhasSalvas}
          mapaId={id}
          congelado={!rascunho}
          ultimasCompras={ultimasCompras}
          duplicatasInfo={detectarDuplicatas(grupos, sinonimos)}
          onSalvar={salvarSelecoes}
          onAprovar={aprovarMapa}
        />
      )}
    </div>
  )
}
