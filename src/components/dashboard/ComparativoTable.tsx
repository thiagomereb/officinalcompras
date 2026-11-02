'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Search, Package } from 'lucide-react'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import { Vazio } from '@/components/ui/Vazio'

export type ComparativoRow = {
  insumo_id: string
  insumo_nome: string
  cas_number: string | null
  melhor_fornecedor: string
  melhor_cotacao_id: string
  // Preços na unidade base (R$/g, R$/mL, R$/un) indicada em `unidade`
  melhor_preco: number
  segundo_preco: number | null
  diferenca_pct: number | null
  prazo_entrega: number | null
  validade: string | null
  score: number
  unidade: string | null
}

export function ComparativoTable({ rows }: { rows: ComparativoRow[] }) {
  const [search, setSearch] = useState('')

  const termo = search.trim().toLowerCase()
  const filtered = termo
    ? rows.filter(
        (r) =>
          r.insumo_nome.toLowerCase().includes(termo) ||
          (r.cas_number ?? '').toLowerCase().includes(termo) ||
          r.melhor_fornecedor.toLowerCase().includes(termo),
      )
    : rows

  return (
    <section className="painel">
      <div className="painel-topo">
        <div>
          <h2 className="painel-titulo">Melhor oferta por insumo</h2>
          <p className="text-[12.5px] text-ardosia">
            {rows.length.toLocaleString('pt-BR')} insumo(s) com cotação vigente, preço na unidade base
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por insumo, CAS ou fornecedor"
            aria-label="Filtrar insumos"
            className="campo campo-sm pl-8"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Vazio
          embutido
          icone={Package}
          titulo={rows.length === 0 ? 'Nenhuma cotação vigente' : 'Nada encontrado'}
          texto={
            rows.length === 0
              ? 'Lance uma cotação e vincule os itens aos insumos para ver a comparação aqui.'
              : `Nenhum insumo, CAS ou fornecedor corresponde a “${search.trim()}”.`
          }
          acao={
            rows.length === 0 && (
              <Link href="/cotacoes/nova" className="btn btn-secundario btn-sm">
                Nova cotação
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Melhor oferta</th>
                <th className="num">Preço</th>
                <th className="num">2º menor</th>
                <th className="num">Diferença</th>
                <th className="num">Entrega</th>
                <th>Validade lote</th>
                <th className="w-10">
                  <span className="sr-only">Abrir cotação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.insumo_id}>
                  <td className="min-w-[200px]">
                    <p className="font-medium">{row.insumo_nome}</p>
                    {row.cas_number && <p className="leitura text-[11.5px] text-ardosia">CAS {row.cas_number}</p>}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3.5 w-[3px] rounded-full bg-ambar" aria-hidden="true" />
                      {row.melhor_fornecedor}
                    </span>
                  </td>
                  <td className="num">
                    <LeituraPreco valor={row.melhor_preco} base={row.unidade} className="font-medium" />
                  </td>
                  <td className="num text-ardosia">
                    {row.segundo_preco != null ? <LeituraPreco valor={row.segundo_preco} base={row.unidade} /> : '—'}
                  </td>
                  <td className="num">
                    {row.diferenca_pct != null ? (
                      <span className="leitura text-[12.5px]">
                        +{row.diferenca_pct.toFixed(1).replace('.', ',')}%
                      </span>
                    ) : (
                      <span className="text-ardosia-2">único</span>
                    )}
                  </td>
                  <td className="num text-ardosia">{row.prazo_entrega != null ? `${row.prazo_entrega} d` : '—'}</td>
                  <td className="whitespace-nowrap text-ardosia">
                    {row.validade ? new Date(row.validade + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td>
                    <Link
                      href={`/cotacoes/${row.melhor_cotacao_id}`}
                      className="btn btn-fantasma btn-icone btn-sm"
                      aria-label={`Abrir a cotação de ${row.melhor_fornecedor}`}
                      title="Abrir cotação"
                    >
                      <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
