'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Search } from 'lucide-react'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import { melhorDoFornecedor, resumirProduto, type OfertaProduto, type ResumoProduto } from '@/lib/ofertas-cotacao'

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
}

export type FornecedorDaCotacao = { id: string; nome: string }

interface Props {
  cotacaoPropriaId: string
  produtos: ProdutoPedido[]
  ofertas: OfertaProduto[]
  fornecedores: FornecedorDaCotacao[]
}

type Situacao = 'todos' | 'com' | 'sem'

const TODOS = 'todos'
const quantidadeBR = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

function NomeProduto({ p }: { p: ProdutoPedido }) {
  return (
    <>
      <Link href={`/insumos/${p.insumo_id}`} className="hover:underline">
        {p.nome}
      </Link>
      {p.novo_no_cadastro && (
        <span className="selo ml-2 h-5 px-1.5 text-[11px]" title="Entrou no cadastro de insumos com esta cotação">
          novo no cadastro
        </span>
      )}
    </>
  )
}

export function ProdutosCotacaoPropria({ cotacaoPropriaId, produtos, ofertas, fornecedores }: Props) {
  const [fornecedor, setFornecedor] = useState<string>(TODOS)
  const [situacao, setSituacao] = useState<Situacao>('todos')
  const [busca, setBusca] = useState('')

  const resumos = useMemo(() => {
    const porPedido = new Map<string, OfertaProduto[]>()
    for (const o of ofertas) porPedido.set(o.pedidoId, [...(porPedido.get(o.pedidoId) ?? []), o])
    return new Map<string, ResumoProduto>(produtos.map((p) => [p.id, resumirProduto(p, porPedido.get(p.id) ?? [])]))
  }, [produtos, ofertas])

  const termo = busca.trim().toLowerCase()
  const casaBusca = (p: ProdutoPedido) =>
    !termo || p.nome.toLowerCase().includes(termo) || p.codigo.includes(termo) || (p.ean ?? '').includes(termo)

  const comCotacao = produtos.filter((p) => resumos.get(p.id)!.qf > 0).length
  const todosOsFornecedores = fornecedor === TODOS

  // "Todos": o pedido inteiro, com QF e o menor preço de cada produto
  const linhasTodos = produtos.filter((p) => {
    const qf = resumos.get(p.id)!.qf
    return casaBusca(p) && (situacao === 'todos' || (situacao === 'com' ? qf > 0 : qf === 0))
  })
  const valorPeloMenor = produtos.reduce((s, p) => s + (resumos.get(p.id)!.menor?.valorPedido ?? 0), 0)

  // Um fornecedor: o que ele cotou, com a melhor embalagem dele para cada produto
  const linhasFornecedor = todosOsFornecedores
    ? []
    : produtos.flatMap((p) => {
        const resumo = resumos.get(p.id)!
        const melhor = melhorDoFornecedor(resumo, fornecedor)
        if (!melhor || !casaBusca(p)) return []
        return [
          {
            p,
            melhor,
            outras: resumo.ofertas.filter((o) => o.fornecedorId === fornecedor).length - 1,
            menorPreco: resumo.fornecedoresMenor.has(fornecedor),
          },
        ]
      })
  const cotadosPeloFornecedor = todosOsFornecedores
    ? 0
    : produtos.filter((p) => resumos.get(p.id)!.ofertas.some((o) => o.fornecedorId === fornecedor)).length
  const valorFornecedor = linhasFornecedor.reduce((s, l) => s + (l.melhor.valorPedido ?? 0), 0)
  const menorEmQuantos = linhasFornecedor.filter((l) => l.menorPreco).length

  const vazio = (texto: string) => <p className="px-5 py-8 text-center text-[13.5px] text-ardosia">{texto}</p>

  return (
    <section className="painel">
      <div className="painel-topo flex-wrap gap-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="cp-fornecedor" className="legenda mb-1">
              Fornecedores da cotação
            </label>
            <select
              id="cp-fornecedor"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              className="campo campo-sm w-80 max-w-full"
            >
              <option value={TODOS}>Todos os fornecedores</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          {todosOsFornecedores && (
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Situação dos produtos">
              {(
                [
                  ['todos', 'Todos', produtos.length],
                  ['com', 'Com cotação', comCotacao],
                  ['sem', 'Sem cotação', produtos.length - comCotacao],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={situacao === id}
                  onClick={() => setSituacao(id)}
                  className={`btn btn-sm ${situacao === id ? 'btn-secundario' : 'btn-fantasma'}`}
                >
                  {label} <span className="leitura text-ardosia">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative w-full sm:w-64">
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

      <p className="border-b border-linha-2 px-5 py-2 text-[12px] text-ardosia">
        <span className="leitura font-medium text-grafite">QF</span> fornecedores que cotaram o produto ·{' '}
        <span className="leitura font-medium text-grafite">ME</span> menor preço por g/mL entre os orçamentos · valores
        calculados pela quantidade pedida
      </p>

      {todosOsFornecedores ? (
        linhasTodos.length === 0 ? (
          vazio(termo ? `Nenhum produto corresponde a “${busca.trim()}”.` : 'Nenhum produto nesta situação.')
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela tabela-compacta whitespace-nowrap">
              <thead>
                <tr>
                  <th className="num" title="Quantos fornecedores cotaram o produto">
                    QF
                  </th>
                  <th>Código</th>
                  <th>Produto</th>
                  <th className="num">Teor</th>
                  <th className="num">Pedido</th>
                  <th className="num">Menor preço</th>
                  <th>Fornecedor (ME)</th>
                  <th className="num">Valor do pedido</th>
                </tr>
              </thead>
              <tbody>
                {linhasTodos.map((p) => {
                  const r = resumos.get(p.id)!
                  const nomesMenor = [...new Set(r.ofertas.filter((o) => r.fornecedoresMenor.has(o.fornecedorId)).map((o) => o.fornecedor))]
                  return (
                    <tr key={p.id} className={r.qf === 0 ? 'text-ardosia' : undefined}>
                      <td className={`num leitura ${r.qf === 0 ? 'text-ardosia-2' : 'font-medium'}`}>{r.qf}</td>
                      <td className="leitura text-ardosia">{p.codigo}</td>
                      <td>
                        <NomeProduto p={p} />
                      </td>
                      <td className="num leitura text-ardosia">{p.teor != null ? `${quantidadeBR(p.teor)}%` : '—'}</td>
                      <td className="num leitura">
                        {quantidadeBR(p.quantidade)} {p.unidade}
                      </td>
                      <td className="num">{r.menor ? <LeituraPreco valor={r.menor.precoBase} base={r.menor.base} /> : '—'}</td>
                      <td className="max-w-[260px] truncate text-[12.5px]" title={nomesMenor.join(', ')}>
                        {nomesMenor.join(', ') || <span className="text-ardosia-2">—</span>}
                      </td>
                      <td className="num leitura">{r.menor?.valorPedido != null ? moeda(r.menor.valorPedido) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : linhasFornecedor.length === 0 ? (
        vazio(termo ? `Nenhum produto cotado por este fornecedor corresponde a “${busca.trim()}”.` : 'Este fornecedor não cotou nenhum produto do pedido.')
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-compacta whitespace-nowrap">
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th className="num">Pedido</th>
                <th>Embalagem cotada</th>
                <th className="num">Preço</th>
                <th className="num">Por unidade base</th>
                <th className="text-center" title="Menor preço entre os orçamentos">
                  ME
                </th>
                <th className="num">Valor do pedido</th>
                <th>Validade</th>
              </tr>
            </thead>
            <tbody>
              {linhasFornecedor.map(({ p, melhor, outras, menorPreco }) => (
                <tr key={p.id}>
                  <td className="leitura text-ardosia">{p.codigo}</td>
                  <td>
                    <NomeProduto p={p} />
                    {melhor.aConferir && (
                      <Link
                        href={`/cotacoes-proprias/${cotacaoPropriaId}/orcamentos/${melhor.orcamentoId}`}
                        className="selo ml-2 h-5 px-1.5 text-[11px] hover:underline"
                        title="Vínculo sugerido pela leitura, ainda não conferido"
                      >
                        a conferir
                      </Link>
                    )}
                  </td>
                  <td className="num leitura">
                    {quantidadeBR(p.quantidade)} {p.unidade}
                  </td>
                  <td className="text-ardosia">
                    {melhor.embalagens && melhor.embalagens !== 1 ? `${quantidadeBR(melhor.embalagens)}× ` : ''}
                    {melhor.embalagem != null ? `${quantidadeBR(melhor.embalagem)} ` : ''}
                    {melhor.unidade ?? ''}
                    {outras > 0 && <span className="ml-1.5 text-[11.5px] text-ardosia-2">+{outras} embalagem(ns)</span>}
                  </td>
                  <td className="num leitura">{moeda(melhor.precoEmbalagem)}</td>
                  <td className="num">
                    <LeituraPreco valor={melhor.precoBase} base={melhor.base} />
                    {!melhor.comparavel && <div className="text-[11px] text-oxido">unidade diferente do pedido</div>}
                  </td>
                  <td className="text-center">
                    {menorPreco && <Check size={15} className="mx-auto text-salvia" aria-label="Menor preço" />}
                  </td>
                  <td className="num leitura">{melhor.valorPedido != null ? moeda(melhor.valorPedido) : '—'}</td>
                  <td className="text-ardosia">{melhor.validade ? data(melhor.validade) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-linha-2 px-5 py-3 text-[12.5px] text-ardosia">
        {todosOsFornecedores ? (
          <>
            <span>
              Com cotação: <span className="leitura text-grafite">{comCotacao}</span> de {produtos.length}
            </span>
            <span>
              Valor pelo menor preço: <span className="leitura font-medium text-grafite">{moeda(valorPeloMenor)}</span>
            </span>
          </>
        ) : (
          <>
            <span>
              Cotou <span className="leitura text-grafite">{cotadosPeloFornecedor}</span> de {produtos.length}
            </span>
            <span>
              Menor preço em <span className="leitura text-grafite">{menorEmQuantos}</span>
            </span>
            <span>
              Valor do pedido com este fornecedor:{' '}
              <span className="leitura font-medium text-grafite">{moeda(valorFornecedor)}</span>
            </span>
          </>
        )}
      </div>
    </section>
  )
}
