'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

export type ProdutoPedido = {
  id: string
  codigo: string
  ean: string | null
  nome: string
  teor: number | null
  quantidade: number
  unidade: string
  insumo_id: string
  // O insumo entrou no cadastro com esta importação
  novo_no_cadastro: boolean
  // Em quantos orçamentos o produto aparece
  ofertas: number
}

const quantidadeBR = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

export function ProdutosCotacaoPropria({ produtos }: { produtos: ProdutoPedido[] }) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const filtrados = termo
    ? produtos.filter(
        (p) => p.nome.toLowerCase().includes(termo) || p.codigo.includes(termo) || (p.ean ?? '').includes(termo),
      )
    : produtos

  return (
    <section className="painel">
      <div className="painel-topo">
        <div>
          <h2 className="painel-titulo">Produtos pedidos</h2>
          <p className="text-[12.5px] text-ardosia">
            {produtos.length.toLocaleString('pt-BR')} produto(s), na ordem do relatório
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por nome, código ou EAN"
            aria-label="Filtrar produtos"
            className="campo campo-sm pl-8"
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ardosia">
          Nenhum produto corresponde a “{busca.trim()}”.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-compacta whitespace-nowrap">
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th className="num">Teor</th>
                <th className="num">Quantidade</th>
                <th className="num">Ofertas</th>
                <th>EAN</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id}>
                  <td className="leitura text-ardosia">{p.codigo}</td>
                  <td>
                    <Link href={`/insumos/${p.insumo_id}`} className="hover:underline">
                      {p.nome}
                    </Link>
                    {p.novo_no_cadastro && (
                      <span className="selo ml-2 h-5 px-1.5 text-[11px]" title="Entrou no cadastro de insumos com esta cotação">
                        novo no cadastro
                      </span>
                    )}
                  </td>
                  <td className="num leitura text-ardosia">{p.teor != null ? `${quantidadeBR(p.teor)}%` : '—'}</td>
                  <td className="num leitura">
                    {quantidadeBR(p.quantidade)} {p.unidade}
                  </td>
                  <td className={`num leitura ${p.ofertas ? '' : 'text-ardosia-2'}`}>{p.ofertas || '—'}</td>
                  <td className="leitura text-[12px] text-ardosia">{p.ean ?? 'sem GTIN'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
