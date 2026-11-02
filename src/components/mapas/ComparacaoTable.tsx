'use client'

import { useState, useTransition } from 'react'
import { Check, Save, Printer } from 'lucide-react'
import type { GrupoInsumo } from '@/lib/comparacao'
import type { salvarSelecoes } from '@/app/(dashboard)/mapas/actions'
import { LeituraPreco } from '@/components/ui/LeituraPreco'

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
  const [erro, setErro] = useState<string | null>(null)

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

    setErro(null)
    startTransition(async () => {
      const resultado = await onSalvar(mapaId, payload)
      if (resultado?.erro) {
        setErro(resultado.erro)
        return
      }
      setSaved(true)
    })
  }

  const totalSelecionados = grupos.filter((g) => selecoesFinal[g.insumo_id]).length

  return (
    <div className="space-y-5">
      {/* Barra de ação fixa no topo enquanto rola a lista de insumos */}
      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-linha bg-nevoa/95 px-4 py-3 backdrop-blur lg:top-0 lg:-mx-10 lg:px-10">
        <p className="text-[13px] text-ardosia">
          <span className="num font-medium text-grafite">{totalSelecionados}</span> de{' '}
          <span className="num font-medium text-grafite">{grupos.length}</span> insumos com fornecedor escolhido
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {erro && (
            <span className="text-[13px] text-oxido" role="alert">
              {erro}
            </span>
          )}
          <a href={`/mapas/${mapaId}/imprimir`} target="_blank" rel="noopener noreferrer" className="btn btn-secundario btn-sm">
            <Printer size={14} />
            Imprimir
          </a>
          {!aprovado && (
            <button onClick={handleSalvar} disabled={pending} className="btn btn-primario btn-sm">
              {pending ? <span className="girador" aria-hidden="true" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {pending ? 'Salvando…' : saved ? 'Escolhas salvas' : 'Salvar escolhas'}
            </button>
          )}
        </div>
      </div>

      {grupos.map((grupo) => {
        const selecionadoId = selecoesFinal[grupo.insumo_id]
        const duplicata = duplicatasInfo?.[grupo.insumo_id]

        return (
          <section key={grupo.insumo_id} className="painel" aria-labelledby={`insumo-${grupo.insumo_id}`}>
            <div className="painel-topo">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 id={`insumo-${grupo.insumo_id}`} className="painel-titulo">
                  {grupo.insumo_nome}
                </h3>
                {duplicata &&
                  (duplicata.eMaisBarato ? (
                    <span className="selo selo-ambar">mais barato que &ldquo;{duplicata.outroNome}&rdquo;, mesmo insumo</span>
                  ) : (
                    <span className="selo selo-alerta">
                      +{duplicata.diffPct.toFixed(0)}% que &ldquo;{duplicata.outroNome}&rdquo;, mesmo insumo
                    </span>
                  ))}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[12.5px] text-ardosia">{grupo.candidatos.length} oferta(s)</span>
                <label className="flex items-center gap-2 text-[12.5px] text-ardosia">
                  Quantidade
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    disabled={aprovado}
                    value={quantidades[grupo.insumo_id] ?? ''}
                    onChange={(e) => handleQuantidade(grupo.insumo_id, Number(e.target.value))}
                    className="campo campo-sm leitura w-24 text-right"
                    placeholder="0"
                  />
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="tabela tabela-compacta whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="w-10">
                      <span className="sr-only">Escolher</span>
                    </th>
                    <th>Fornecedor</th>
                    <th className="num">Preço</th>
                    <th>Embalagem</th>
                    <th className="num">Por unidade base</th>
                    <th className="num">Entrega</th>
                    <th className="num">Pgto</th>
                    <th className="num">Frete</th>
                    <th>Validade lote</th>
                    <th className="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.candidatos.map((c, idx) => {
                    const isSelecionado = selecionadoId === c.cotacao_item_id
                    return (
                      <tr
                        key={c.cotacao_item_id}
                        onClick={() => handleSelecionar(grupo.insumo_id, c.cotacao_item_id)}
                        className={`${aprovado ? '' : 'cursor-pointer'} ${isSelecionado ? 'escolhido' : ''}`}
                      >
                        <td>
                          <input
                            type="radio"
                            name={`escolha-${grupo.insumo_id}`}
                            checked={isSelecionado}
                            disabled={aprovado}
                            onChange={() => handleSelecionar(grupo.insumo_id, c.cotacao_item_id)}
                            aria-label={`Escolher ${c.fornecedor_nome}`}
                            className="h-4 w-4 cursor-pointer accent-grafite"
                          />
                        </td>
                        <td>
                          <span className={isSelecionado ? 'font-medium' : ''}>{c.fornecedor_nome}</span>
                          {idx === 0 && <span className="ml-2 text-[11.5px] text-ardosia">melhor score</span>}
                        </td>
                        <td className="num leitura">
                          {c.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="text-ardosia">
                          {c.quantidade_minima ? `${c.quantidade_minima} ` : ''}
                          {c.unidade ?? '—'}
                        </td>
                        <td className="num">
                          <LeituraPreco valor={c.preco_base} base={c.unidade_base} className={isSelecionado ? 'font-medium' : ''} />
                          {!c.preco_comparavel && (
                            <div
                              className="text-[11px] text-oxido"
                              title="Unidade de outra grandeza que a dos demais fornecedores: o preço não entrou no score"
                            >
                              unidade diferente
                            </div>
                          )}
                        </td>
                        <td className="num text-ardosia">{c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias} d` : '—'}</td>
                        <td className="num text-ardosia">{c.prazo_pagamento_dias != null ? `${c.prazo_pagamento_dias} d` : '—'}</td>
                        <td className="num text-ardosia">
                          {c.frete_fixo ? c.frete_fixo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'grátis'}
                        </td>
                        <td className="text-ardosia">
                          {c.validade ? new Date(c.validade + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="num leitura">{(c.score * 100).toFixed(0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
