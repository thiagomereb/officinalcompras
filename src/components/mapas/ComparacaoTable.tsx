'use client'

import { useState, useTransition } from 'react'
import { CheckCircle, Trophy, Save, Printer } from 'lucide-react'
import type { GrupoInsumo } from '@/lib/comparacao'
import type { salvarSelecoes } from '@/app/(dashboard)/mapas/actions'

type InfoDuplicata = { outroId: string; outroNome: string; eMaisBarato: boolean; diffPct: number }

interface Props {
  grupos: GrupoInsumo[]
  selecoesSalvas: Record<string, { cotacao_item_id: string; quantidade: number }>
  mapaId: string
  aprovado: boolean
  onSalvar: typeof salvarSelecoes
  duplicatasInfo?: Record<string, InfoDuplicata>
}

export function ComparacaoTable({ grupos, selecoesSalvas, mapaId, aprovado, onSalvar, duplicatasInfo }: Props) {
  const [selecoes, setSelecoes] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(selecoesSalvas).map(([k, v]) => [k, v.cotacao_item_id]))
  )
  const [quantidades, setQuantidades] = useState<Record<string, number>>(
    Object.fromEntries(Object.entries(selecoesSalvas).map(([k, v]) => [k, v.quantidade]))
  )
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  // Auto-seleciona o melhor candidato se ainda não há seleção
  const selecoesFinal = { ...selecoes }
  for (const grupo of grupos) {
    if (!selecoesFinal[grupo.insumo_id] && grupo.candidatos.length > 0) {
      selecoesFinal[grupo.insumo_id] = grupo.candidatos[0].cotacao_item_id
    }
  }

  function handleSelecionar(insumo_id: string, cotacao_item_id: string) {
    if (aprovado) return
    setSelecoes((s) => ({ ...s, [insumo_id]: cotacao_item_id }))
    setSaved(false)
  }

  function handleQuantidade(insumo_id: string, val: number) {
    setQuantidades((q) => ({ ...q, [insumo_id]: val }))
    setSaved(false)
  }

  function handleSalvar() {
    const payload = grupos.map((g) => ({
      insumo_id: g.insumo_id,
      cotacao_item_id: selecoesFinal[g.insumo_id] ?? g.candidatos[0]?.cotacao_item_id ?? '',
      quantidade: quantidades[g.insumo_id] ?? 1,
    })).filter((s) => s.cotacao_item_id)

    startTransition(async () => {
      await onSalvar(mapaId, payload)
      setSaved(true)
    })
  }

  const totalSelecionados = grupos.filter((g) => selecoesFinal[g.insumo_id]).length

  return (
    <div className="space-y-6">
      {/* Barra de ação */}
      <div className="flex items-center justify-between sticky top-0 bg-white z-10 py-3 border-b border-gray-200 -mx-8 px-8">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{totalSelecionados}</span> de{' '}
          <span className="font-medium text-gray-900">{grupos.length}</span> insumos selecionados
        </p>
        <div className="flex items-center gap-3">
          <a
            href="imprimir"
            target="_blank"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Printer size={15} />
            Imprimir
          </a>
          {!aprovado && (
            <button
              onClick={handleSalvar}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {pending ? 'Salvando...' : saved ? 'Salvo ✓' : 'Salvar seleções'}
            </button>
          )}
        </div>
      </div>

      {/* Grupos por insumo */}
      {grupos.map((grupo) => {
        const selecionadoId = selecoesFinal[grupo.insumo_id]

        return (
          <div key={grupo.insumo_id} className={`bg-white rounded-xl border overflow-hidden ${
              duplicatasInfo?.[grupo.insumo_id]?.eMaisBarato
                ? 'border-green-300'
                : duplicatasInfo?.[grupo.insumo_id]
                ? 'border-yellow-300'
                : 'border-gray-200'
            }`}>
            <div className={`px-5 py-3 border-b flex items-center justify-between ${
              duplicatasInfo?.[grupo.insumo_id]?.eMaisBarato
                ? 'bg-green-50 border-green-200'
                : duplicatasInfo?.[grupo.insumo_id]
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-gray-900">{grupo.insumo_nome}</h4>
                {duplicatasInfo?.[grupo.insumo_id] && (() => {
                  const d = duplicatasInfo[grupo.insumo_id]
                  return d.eMaisBarato
                    ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        ✓ Mais barato · dupl. de &ldquo;{d.outroNome}&rdquo;
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                        ⚠ +{d.diffPct.toFixed(0)}% mais caro · dupl. de &ldquo;{d.outroNome}&rdquo;
                      </span>
                    )
                })()}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{grupo.candidatos.length} fornecedor(es)</span>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Qtd:</label>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    disabled={aprovado}
                    value={quantidades[grupo.insumo_id] ?? ''}
                    onChange={(e) => handleQuantidade(grupo.insumo_id, Number(e.target.value))}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2 text-xs font-medium text-gray-400">Fornecedor</th>
                  <th className="text-right px-5 py-2 text-xs font-medium text-gray-400">Preço Unit.</th>
                  <th className="text-left px-5 py-2 text-xs font-medium text-gray-400">Unid.</th>
                  <th className="text-right px-5 py-2 text-xs font-medium text-gray-400">Entrega</th>
                  <th className="text-right px-5 py-2 text-xs font-medium text-gray-400">Pgto</th>
                  <th className="text-right px-5 py-2 text-xs font-medium text-gray-400">Frete</th>
                  <th className="text-left px-5 py-2 text-xs font-medium text-gray-400">Validade Lote</th>
                  <th className="text-right px-5 py-2 text-xs font-medium text-gray-400">Score</th>
                  <th className="w-10 px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {grupo.candidatos.map((c, idx) => {
                  const isSelecionado = selecionadoId === c.cotacao_item_id
                  const isMelhor = idx === 0

                  return (
                    <tr
                      key={c.cotacao_item_id}
                      onClick={() => handleSelecionar(grupo.insumo_id, c.cotacao_item_id)}
                      className={`transition-colors ${aprovado ? '' : 'cursor-pointer'} ${
                        isSelecionado
                          ? 'bg-blue-50 hover:bg-blue-100'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          {isMelhor && !isSelecionado && (
                            <Trophy size={12} className="text-yellow-500 shrink-0" />
                          )}
                          <span className={`font-medium ${isSelecionado ? 'text-blue-700' : 'text-gray-700'}`}>
                            {c.fornecedor_nome}
                          </span>
                        </div>
                      </td>
                      <td className={`px-5 py-2.5 text-right font-mono font-medium ${isSelecionado ? 'text-blue-700' : 'text-gray-900'}`}>
                        {c.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-5 py-2.5 text-gray-500">{c.unidade ?? '—'}</td>
                      <td className="px-5 py-2.5 text-right text-gray-500">
                        {c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias}d` : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right text-gray-500">
                        {c.prazo_pagamento_dias != null ? `${c.prazo_pagamento_dias}d` : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right text-gray-500">
                        {c.frete_fixo ? `R$ ${c.frete_fixo.toFixed(2)}` : 'Grátis'}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-gray-500">
                        {c.validade ? new Date(c.validade + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isMelhor ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {(c.score * 100).toFixed(0)}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-center">
                        {isSelecionado && (
                          <CheckCircle size={16} className="text-blue-600 mx-auto" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
