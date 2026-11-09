'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, Search } from 'lucide-react'
import { precoPorUnidadeBase } from '@/lib/unidades'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import type { alterarVinculoOrcamento, confirmarSugestoes } from '@/app/(dashboard)/cotacoes-proprias/orcamentos-actions'

export type ProdutoPedidoOpcao = { id: string; codigo: string; nome: string }

export type ItemOrcamento = {
  id: string
  descricao: string
  preco_unitario: number
  quantidade_minima: number | null
  quantidade: number | null
  unidade: string | null
  validade: string | null
  pais_origem: string | null
  ipi: number | null
  pedido: ProdutoPedidoOpcao | null
  origem: 'ia' | 'sinonimo' | 'comprador' | null
  obs: string | null
}

interface Props {
  itens: ItemOrcamento[]
  pedidos: ProdutoPedidoOpcao[]
  orcamentoId: string
  cotacaoPropriaId: string
  alterar: typeof alterarVinculoOrcamento
  confirmar: typeof confirmarSugestoes
}

type Filtro = 'todos' | 'conferir' | 'fora'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
const MAX_OPCOES = 8

function SeletorProdutoPedido({
  pedidos,
  pendente,
  onEscolher,
  onCancelar,
}: {
  pedidos: ProdutoPedidoOpcao[]
  pendente: boolean
  onEscolher: (id: string | null) => void
  onCancelar: () => void
}) {
  const [termo, setTermo] = useState('')
  const t = termo.trim().toLowerCase()
  const opcoes = (t ? pedidos.filter((p) => p.nome.toLowerCase().includes(t) || p.codigo.includes(t)) : pedidos).slice(0, MAX_OPCOES)

  return (
    <div className="max-w-xl space-y-2 py-1 whitespace-normal">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
        <input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelar()
            if (e.key === 'Enter' && opcoes[0]) onEscolher(opcoes[0].id)
          }}
          placeholder="Buscar entre os produtos pedidos…"
          aria-label="Buscar produto pedido"
          disabled={pendente}
          className="campo campo-sm pl-8"
        />
      </div>
      <ul className="overflow-hidden rounded-lg border border-linha bg-papel">
        {opcoes.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onEscolher(p.id)}
              disabled={pendente}
              className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-nevoa"
            >
              <span className="leitura text-[12px] text-ardosia">{p.codigo}</span>
              {p.nome}
            </button>
          </li>
        ))}
        {opcoes.length === 0 && <li className="px-3 py-2 text-[13px] text-ardosia">Nenhum produto pedido com esse nome.</li>}
      </ul>
      <div className="flex items-center gap-1">
        <button onClick={() => onEscolher(null)} disabled={pendente} className="btn btn-fantasma btn-sm">
          Não foi pedido
        </button>
        <button onClick={onCancelar} disabled={pendente} className="btn btn-fantasma btn-sm">
          Cancelar
        </button>
        {pendente && <span className="girador text-ardosia" aria-label="Salvando" />}
      </div>
    </div>
  )
}

export function ItensOrcamento({ itens, pedidos, orcamentoId, cotacaoPropriaId, alterar, confirmar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>(() => (itens.some((i) => i.origem === 'ia') ? 'conferir' : 'todos'))
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const aConferir = itens.filter((i) => i.origem === 'ia')
  const fora = itens.filter((i) => !i.pedido)
  const termo = busca.trim().toLowerCase()
  const visiveis = (filtro === 'conferir' ? aConferir : filtro === 'fora' ? fora : itens).filter(
    (i) => !termo || i.descricao.toLowerCase().includes(termo) || (i.pedido?.nome.toLowerCase().includes(termo) ?? false),
  )

  function escolher(itemId: string, pedidoId: string | null) {
    setErro(null)
    startTransition(async () => {
      const r = await alterar(itemId, pedidoId, orcamentoId, cotacaoPropriaId)
      if (r?.erro) setErro(r.erro)
      else setEditando(null)
    })
  }

  function confirmarTodas() {
    setErro(null)
    startTransition(async () => {
      const r = await confirmar(orcamentoId, cotacaoPropriaId)
      if ('erro' in r) setErro(r.erro)
    })
  }

  const abas: { id: Filtro; label: string; n: number }[] = [
    { id: 'conferir', label: 'A conferir', n: aConferir.length },
    { id: 'fora', label: 'Fora da cotação', n: fora.length },
    { id: 'todos', label: 'Todos', n: itens.length },
  ]

  return (
    <section className="painel">
      <div className="painel-topo flex-wrap gap-y-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist">
          {abas.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={filtro === a.id}
              onClick={() => setFiltro(a.id)}
              className={`btn btn-sm ${filtro === a.id ? 'btn-secundario' : 'btn-fantasma'}`}
            >
              {a.label} <span className="leitura text-ardosia">{a.n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar itens"
              aria-label="Filtrar itens do orçamento"
              className="campo campo-sm pl-8"
            />
          </div>
          {aConferir.length > 0 && (
            <button onClick={confirmarTodas} disabled={pendente} className="btn btn-primario btn-sm">
              {pendente ? <span className="girador" aria-hidden="true" /> : <Check size={14} />}
              Confirmar as {aConferir.length} sugestões
            </button>
          )}
        </div>
      </div>

      {filtro === 'conferir' && aConferir.length > 0 && (
        <p className="border-b border-linha-2 px-5 py-2.5 text-[12.5px] text-ardosia">
          Vínculos sugeridos pela leitura. Corrija o que estiver errado pelo lápis e confirme o resto de uma vez: cada
          descrição confirmada vira sinônimo do insumo e na próxima vez já entra certa.
        </p>
      )}
      {erro && (
        <p className="aviso aviso-erro mx-5 mt-3" role="alert">
          {erro}
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ardosia">
          {filtro === 'conferir' && !termo ? 'Nenhum vínculo para conferir.' : 'Nenhum item aqui.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-compacta whitespace-nowrap">
            <thead>
              <tr>
                <th>Item do fornecedor</th>
                <th>Produto pedido</th>
                <th>Embalagem</th>
                <th className="num">Preço</th>
                <th className="num">Por unidade base</th>
                <th>Validade</th>
                <th>Origem</th>
                <th className="num">IPI</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => {
                const base = precoPorUnidadeBase(i.preco_unitario, i.quantidade_minima, i.unidade)
                const emEdicao = editando === i.id
                return (
                  <tr key={i.id} className="group/linha align-top">
                    <td className="max-w-[280px]">
                      <div className="truncate" title={i.descricao}>
                        {i.descricao}
                      </div>
                      {i.obs && (
                        <div className={`whitespace-normal text-[11.5px] ${i.pedido ? 'text-oxido' : 'text-ardosia'}`}>{i.obs}</div>
                      )}
                    </td>
                    <td className="min-w-[240px]">
                      {emEdicao ? (
                        <SeletorProdutoPedido
                          pedidos={pedidos}
                          pendente={pendente}
                          onEscolher={(id) => escolher(i.id, id)}
                          onCancelar={() => setEditando(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          {i.pedido ? (
                            <span className="truncate" title={`${i.pedido.codigo} · ${i.pedido.nome}`}>
                              {i.pedido.nome}
                            </span>
                          ) : (
                            <span className="text-ardosia-2">fora da cotação</span>
                          )}
                          {i.origem === 'ia' && <span className="selo h-5 shrink-0 px-1.5 text-[11px]">a conferir</span>}
                          <button
                            onClick={() => setEditando(i.id)}
                            className="btn btn-fantasma btn-icone btn-sm h-6 w-6 shrink-0 opacity-40 group-hover/linha:opacity-100 focus-visible:opacity-100"
                            title="Trocar o produto pedido"
                            aria-label={`Trocar o produto pedido de ${i.descricao}`}
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="text-ardosia">
                      {i.quantidade && i.quantidade !== 1 ? `${i.quantidade.toLocaleString('pt-BR')}× ` : ''}
                      {i.quantidade_minima != null ? `${i.quantidade_minima.toLocaleString('pt-BR')} ` : ''}
                      {i.unidade ?? ''}
                    </td>
                    <td className="num leitura">{moeda(i.preco_unitario)}</td>
                    <td className="num">
                      <LeituraPreco valor={base.valor} base={base.base} />
                    </td>
                    <td className="text-ardosia">{i.validade ? data(i.validade) : '—'}</td>
                    <td className="text-[12.5px] text-ardosia">{i.pais_origem ?? '—'}</td>
                    <td className="num text-ardosia">{i.ipi ? `${i.ipi}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
