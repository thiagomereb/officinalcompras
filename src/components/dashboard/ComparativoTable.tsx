'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export type ComparativoRow = {
  insumo_id: string
  insumo_nome: string
  cas_number: string | null
  melhor_fornecedor: string
  melhor_cotacao_id: string
  melhor_preco: number
  segundo_preco: number | null
  diferenca_pct: number | null
  prazo_entrega: number | null
  validade: string | null
  score: number
  unidade: string | null
}

function scoreBadgeClass(score: number) {
  if (score >= 0.7) return 'bg-emerald-100 text-emerald-700'
  if (score >= 0.4) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

export function ComparativoTable({ rows }: { rows: ComparativoRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = rows.filter(
    (r) =>
      r.insumo_nome.toLowerCase().includes(search.toLowerCase()) ||
      (r.cas_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      r.melhor_fornecedor.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Comparativo de Insumos</h3>
          <p className="text-xs text-slate-400 mt-0.5">{rows.length} insumos com cotações disponíveis</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo ou fornecedor..."
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-slate-400 text-sm">
          {rows.length === 0
            ? 'Nenhum insumo com cotações. Cadastre cotações para começar.'
            : 'Nenhum resultado para esta busca.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Insumo</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Melhor Fornecedor</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Melhor Preço</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">2º Preço</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">Diferença</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">Entrega</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">Validade</th>
                <th className="text-center px-4 py-3 font-medium text-slate-500">Score</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((row) => (
                <tr key={row.insumo_id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{row.insumo_nome}</p>
                    {row.cas_number && (
                      <p className="text-[11px] text-slate-400 font-mono">CAS {row.cas_number}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.melhor_fornecedor}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                    {row.melhor_preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    {row.unidade && <span className="text-xs text-slate-400 ml-0.5">/{row.unidade}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-400">
                    {row.segundo_preco != null ? row.segundo_preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.diferenca_pct != null ? (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          row.diferenca_pct > 10
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {row.diferenca_pct.toFixed(1)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">
                    {row.prazo_entrega != null ? `${row.prazo_entrega}d` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500 text-xs">
                    {row.validade
                      ? new Date(row.validade + 'T12:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadgeClass(row.score)}`}
                    >
                      {(row.score * 100).toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/cotacoes/${row.melhor_cotacao_id}`}
                      className="text-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
