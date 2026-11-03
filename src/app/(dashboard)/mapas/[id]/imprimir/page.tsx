import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PESOS_PADRAO, type Pesos } from '@/lib/comparacao'
import { carregarGruposMapa } from '@/lib/mapas'
import { ehComparacaoCongelada, sugestaoDoGrupo, valorEstimado } from '@/lib/compras'
import { ehUnidadeQuantidade, formatarPrecoBase } from '@/lib/unidades'
import { PrintButton } from './PrintButton'
import { Marca } from '@/components/ui/Marca'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CARIMBO = {
  rascunho: { texto: 'Rascunho', cls: 'border-ardosia-2 text-ardosia' },
  aprovado: { texto: 'Aprovado', cls: 'border-salvia text-salvia' },
  exportado: { texto: 'Aprovado', cls: 'border-salvia text-salvia' },
  cancelado: { texto: 'Cancelado', cls: 'border-oxido text-oxido' },
} as const

export default async function ImprimirMapaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mapa } = await supabase.from('mapas_cotacao').select('*').eq('id', id).single()
  if (!mapa) notFound()

  const rascunho = mapa.status === 'rascunho'
  const congelada = ehComparacaoCongelada(mapa.comparacao) ? mapa.comparacao : null
  const pesos: Pesos = congelada?.pesos ?? (mapa.pesos as Pesos | null) ?? PESOS_PADRAO

  // Aprovado imprime o que foi aprovado, não o estado atual das cotações
  const [grupos, { data: escolhas }] = await Promise.all([
    congelada && !rascunho ? Promise.resolve(congelada.grupos) : carregarGruposMapa(supabase, mapa.cotacoes_ids, pesos),
    supabase
      .from('mapa_cotacao_itens')
      .select('insumo_id, cotacao_item_id, quantidade, quantidade_unidade, valor_total')
      .eq('mapa_id', id),
  ])

  const escolhaPorInsumo = new Map((escolhas ?? []).map((e) => [e.insumo_id, e]))

  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
  const carimbo = CARIMBO[mapa.status as keyof typeof CARIMBO] ?? CARIMBO.rascunho

  // No rascunho o total é calculado na hora; aprovado usa o valor gravado
  const totalRascunho = grupos.reduce((soma, g) => {
    const e = escolhaPorInsumo.get(g.insumo_id)
    const c = e && g.candidatos.find((x) => x.cotacao_item_id === e.cotacao_item_id)
    if (!e || !c) return soma
    const v = valorEstimado(c, e.quantidade, ehUnidadeQuantidade(e.quantidade_unidade) ? e.quantidade_unidade : null)
    return v.tipo === 'valor' ? soma + v.valor : soma
  }, 0)
  const total = rascunho ? totalRascunho : mapa.valor_total

  return (
    <div className="min-h-screen bg-papel">
      {/* Barra de impressão — oculta no papel */}
      <div className="sticky top-0 flex items-center justify-between border-b border-linha bg-papel/95 px-6 py-3 backdrop-blur print:hidden">
        <span className="text-[13px] text-ardosia">Prévia de impressão do mapa de cotação</span>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-5xl px-10 py-10">
        <div className="mb-8 border-b-2 border-grafite pb-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <Marca />
              <h1 className="titulo mt-6 text-[24px]">Mapa de cotação</h1>
              <p className="mt-1 text-[16px] text-ardosia">{mapa.titulo}</p>
            </div>
            <div className="text-right">
              {/* No documento que vai para assinatura, a situação aparece como carimbo */}
              <span
                className={`inline-block rounded border-[3px] border-double px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.06em] ${carimbo.cls}`}
              >
                {carimbo.texto}
              </span>
              {mapa.aprovado_em && (
                <p className="mt-3 text-[12.5px] text-ardosia">
                  Aprovado em{' '}
                  {new Date(mapa.aprovado_em).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  })}
                  {mapa.aprovado_por && <> por {mapa.aprovado_por}</>}
                </p>
              )}
              <p className="mt-1 text-[12.5px] text-ardosia">Gerado em {dataGeracao}</p>
            </div>
          </div>
          {mapa.status === 'cancelado' && (
            <p className="mt-4 text-[13px] text-oxido">Cancelado. Motivo: {mapa.motivo_cancelamento ?? '—'}</p>
          )}
        </div>

        {grupos.map((grupo) => {
          const escolha = escolhaPorInsumo.get(grupo.insumo_id)
          const escolhido = escolha ? grupo.candidatos.find((c) => c.cotacao_item_id === escolha.cotacao_item_id) : undefined
          const sugestao = sugestaoDoGrupo(grupo)
          const unidade = escolha && ehUnidadeQuantidade(escolha.quantidade_unidade) ? escolha.quantidade_unidade : null
          const valor =
            escolha && escolhido
              ? rascunho
                ? (() => {
                    const v = valorEstimado(escolhido, escolha.quantidade, unidade)
                    return v.tipo === 'valor' ? v.valor : null
                  })()
                : escolha.valor_total
              : null

          return (
            <div key={grupo.insumo_id} className="mb-8 break-inside-avoid">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h3 className="font-bold text-grafite">{grupo.insumo_nome}</h3>
                {!escolhido && <span className="text-[12.5px] text-ardosia">não comprado</span>}
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-nevoa">
                    <th className="border border-linha px-3 py-1.5 text-left font-semibold">Fornecedor</th>
                    <th className="border border-linha px-3 py-1.5 text-right font-semibold">Preço</th>
                    <th className="border border-linha px-3 py-1.5 text-center font-semibold">Emb.</th>
                    <th className="border border-linha px-3 py-1.5 text-right font-semibold">Preço/base</th>
                    <th className="border border-linha px-3 py-1.5 text-center font-semibold">Entrega</th>
                    <th className="border border-linha px-3 py-1.5 text-center font-semibold">Pgto</th>
                    <th className="border border-linha px-3 py-1.5 text-right font-semibold">Frete</th>
                    <th className="border border-linha px-3 py-1.5 text-center font-semibold">Val. lote</th>
                    <th className="border border-linha px-3 py-1.5 text-center font-semibold">Score</th>
                    <th className="border border-linha px-3 py-1.5 text-center font-semibold">Escolhido</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.candidatos.map((c) => {
                    const isEscolhido = escolhido?.cotacao_item_id === c.cotacao_item_id
                    return (
                      <tr key={c.cotacao_item_id} className={isEscolhido ? 'bg-ambar-veu font-medium' : ''}>
                        <td className="border border-linha px-3 py-1.5">
                          {c.fornecedor_nome}
                          {sugestao?.cotacao_item_id === c.cotacao_item_id && (
                            <span className="ml-1 font-normal text-ardosia">(sugestão)</span>
                          )}
                        </td>
                        <td className="leitura border border-linha px-3 py-1.5 text-right">{moeda(c.preco_unitario)}</td>
                        <td className="border border-linha px-3 py-1.5 text-center">
                          {c.quantidade_minima ? `${c.quantidade_minima} ` : ''}
                          {c.unidade ?? '—'}
                        </td>
                        <td className="leitura border border-linha px-3 py-1.5 text-right">
                          {formatarPrecoBase({ valor: c.preco_base, base: c.unidade_base })}
                        </td>
                        <td className="border border-linha px-3 py-1.5 text-center">
                          {c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias}d` : '—'}
                        </td>
                        <td className="border border-linha px-3 py-1.5 text-center">
                          {c.prazo_pagamento_dias != null ? `${c.prazo_pagamento_dias}d` : '—'}
                        </td>
                        <td className="border border-linha px-3 py-1.5 text-right">
                          {c.frete_fixo ? moeda(c.frete_fixo) : 'Grátis'}
                        </td>
                        <td className="border border-linha px-3 py-1.5 text-center">{formatDate(c.validade)}</td>
                        <td className="border border-linha px-3 py-1.5 text-center">{(c.score * 100).toFixed(0)}</td>
                        <td className="border border-linha px-3 py-1.5 text-center text-lg">{isEscolhido ? '✓' : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {escolha && escolhido && (
                <p className="mt-1.5 text-[12px] text-ardosia">
                  Quantidade:{' '}
                  <strong className="text-grafite">
                    {escolha.quantidade != null ? `${escolha.quantidade.toLocaleString('pt-BR')} ${unidade ?? ''}` : '—'}
                  </strong>
                  {valor != null && (
                    <>
                      {' · '}Valor: <strong className="leitura text-grafite">{moeda(valor)}</strong>
                    </>
                  )}
                </p>
              )}
            </div>
          )
        })}

        {total != null && total > 0 && (
          <p className="mt-6 flex justify-end gap-3 border-t border-linha pt-3 text-[14px]">
            <span className="text-ardosia">Valor total {rascunho ? 'estimado' : 'aprovado'}</span>
            <strong className="leitura">{moeda(total)}</strong>
          </p>
        )}

        {/* Rodapé */}
        <div className="mt-12 border-t-2 border-linha pt-8">
          <div className="grid grid-cols-2 gap-16">
            <div>
              <p className="mb-12 text-xs text-ardosia">Assinatura do comprador</p>
              <div className="border-b border-ardosia-2" />
            </div>
            <div>
              <p className="mb-12 text-xs text-ardosia">Aprovação da diretoria</p>
              <div className="border-b border-ardosia-2" />
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-ardosia-2">Officinal Compras · Mapa de cotação · {dataGeracao}</p>
        </div>
      </div>
    </div>
  )
}
