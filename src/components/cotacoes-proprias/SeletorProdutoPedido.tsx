'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { buscarProdutosPedidos, type ProdutoPedidoOpcao } from '@/lib/busca-pedidos'

export type { ProdutoPedidoOpcao }

interface Props {
  pedidos: ProdutoPedidoOpcao[]
  pendente?: boolean
  // Texto inicial da busca (a descrição do fornecedor ajuda a achar o produto)
  sugestao?: string
  onEscolher: (produto: ProdutoPedidoOpcao | null) => void
  onCancelar: () => void
}

export function SeletorProdutoPedido({ pedidos, pendente = false, sugestao = '', onEscolher, onCancelar }: Props) {
  const [termo, setTermo] = useState(sugestao)
  const opcoes = buscarProdutosPedidos(pedidos, termo)

  return (
    <div className="max-w-xl space-y-2 py-1 whitespace-normal">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
        <input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancelar()
            if (e.key === 'Enter' && opcoes[0]) onEscolher(opcoes[0].produto)
          }}
          placeholder="Buscar produto pedido por nome, código ou sinônimo…"
          aria-label="Buscar produto pedido"
          disabled={pendente}
          className="campo campo-sm pl-8"
        />
      </div>
      <ul className="overflow-hidden rounded-lg border border-linha bg-papel">
        {opcoes.map(({ produto, viaSinonimo }) => (
          <li key={produto.id}>
            <button
              onClick={() => onEscolher(produto)}
              disabled={pendente}
              className="flex w-full flex-col px-3 py-1.5 text-left text-[13px] hover:bg-nevoa"
            >
              <span className="flex items-baseline gap-3">
                <span className="leitura text-[12px] text-ardosia">{produto.codigo}</span>
                {produto.nome}
              </span>
              {viaSinonimo && <span className="text-[11.5px] text-ardosia">sinônimo: {viaSinonimo}</span>}
            </button>
          </li>
        ))}
        {opcoes.length === 0 && (
          <li className="px-3 py-2 text-[13px] text-ardosia">Nenhum produto pedido com esse nome, código ou sinônimo.</li>
        )}
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
