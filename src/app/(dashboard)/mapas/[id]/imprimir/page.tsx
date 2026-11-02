import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PESOS_PADRAO, type Pesos } from '@/lib/comparacao'
import { carregarGruposMapa } from '@/lib/mapas'
import { formatarPrecoBase } from '@/lib/unidades'
import { PrintButton } from './PrintButton'

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default async function ImprimirMapaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mapa } = await supabase.from('mapas_cotacao').select('*').eq('id', id).single()
  if (!mapa) notFound()

  const pesos: Pesos = (mapa.pesos as Pesos) ?? PESOS_PADRAO

  const [grupos, selecoesRes] = await Promise.all([
    carregarGruposMapa(supabase, mapa.cotacoes_ids, pesos),
    supabase
      .from('mapa_cotacao_itens')
      .select('insumo_id, cotacao_item_id, quantidade')
      .eq('mapa_id', id),
  ])

  const selecoesMapa = new Map(
    (selecoesRes.data ?? []).map((s) => [s.insumo_id, s])
  )

  const dataGeracao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="bg-white min-h-screen">
      {/* Botão de imprimir — oculto na impressão */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-8 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">Prévia do Mapa de Cotação</span>
        <PrintButton />
      </div>

      <div className="max-w-5xl mx-auto px-10 py-10">
        {/* Cabeçalho */}
        <div className="border-b-2 border-gray-900 pb-6 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mapa de Cotação</h1>
              <h2 className="text-lg text-gray-600 mt-1">{mapa.titulo}</h2>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Gerado em: {dataGeracao}</p>
              <p>Status: <strong className="text-gray-800">{mapa.status === 'aprovado' ? 'Aprovado' : 'Rascunho'}</strong></p>
            </div>
          </div>
        </div>

        {/* Tabela principal */}
        {grupos.map((grupo) => {
          const selecao = selecoesMapa.get(grupo.insumo_id)
          const vencedor = selecao
            ? grupo.candidatos.find((c) => c.cotacao_item_id === selecao.cotacao_item_id)
            : grupo.candidatos[0]
          const qtd = selecao?.quantidade

          return (
            <div key={grupo.insumo_id} className="mb-8 break-inside-avoid">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-bold text-gray-900">{grupo.insumo_nome}</h3>
                {qtd && (
                  <span className="text-sm text-gray-500">Qtd. solicitada: <strong>{qtd}</strong></span>
                )}
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left border border-gray-300 px-3 py-1.5 font-semibold">Fornecedor</th>
                    <th className="text-right border border-gray-300 px-3 py-1.5 font-semibold">Preço Unit.</th>
                    <th className="text-center border border-gray-300 px-3 py-1.5 font-semibold">Unid.</th>
                    <th className="text-right border border-gray-300 px-3 py-1.5 font-semibold">Preço/base</th>
                    <th className="text-center border border-gray-300 px-3 py-1.5 font-semibold">Entrega</th>
                    <th className="text-center border border-gray-300 px-3 py-1.5 font-semibold">Pgto</th>
                    <th className="text-right border border-gray-300 px-3 py-1.5 font-semibold">Frete</th>
                    <th className="text-center border border-gray-300 px-3 py-1.5 font-semibold">Val. Lote</th>
                    <th className="text-center border border-gray-300 px-3 py-1.5 font-semibold">Score</th>
                    <th className="text-center border border-gray-300 px-3 py-1.5 font-semibold">Selecionado</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.candidatos.map((c) => {
                    const isSelecionado = vencedor?.cotacao_item_id === c.cotacao_item_id
                    return (
                      <tr key={c.cotacao_item_id} className={isSelecionado ? 'bg-blue-50 font-medium' : ''}>
                        <td className="border border-gray-300 px-3 py-1.5">{c.fornecedor_nome}</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-right font-mono">
                          {c.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center">
                          {c.quantidade_minima ? `${c.quantidade_minima} ` : ''}{c.unidade ?? '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-right font-mono">
                          {formatarPrecoBase({ valor: c.preco_base, base: c.unidade_base })}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center">
                          {c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias}d` : '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center">
                          {c.prazo_pagamento_dias != null ? `${c.prazo_pagamento_dias}d` : '—'}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-right">
                          {c.frete_fixo ? `R$ ${c.frete_fixo.toFixed(2)}` : 'Grátis'}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center">
                          {formatDate(c.validade)}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center font-bold">
                          {(c.score * 100).toFixed(0)}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center text-lg">
                          {isSelecionado ? '✓' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}

        {/* Rodapé */}
        <div className="border-t-2 border-gray-300 pt-8 mt-12">
          <div className="grid grid-cols-2 gap-16">
            <div>
              <p className="text-xs text-gray-500 mb-12">Assinatura do Comprador</p>
              <div className="border-b border-gray-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-12">Aprovação da Diretoria</p>
              <div className="border-b border-gray-400" />
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-6">
            Officinal Compras · Mapa de Cotação · {dataGeracao}
          </p>
        </div>
      </div>
    </div>
  )
}
