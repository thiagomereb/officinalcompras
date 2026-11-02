'use client'

import { useState } from 'react'

type Aba = 'todos' | 'vincular'

// As duas listas já vêm prontas do servidor; trocar de aba é só mostrar a outra.
// (Antes a troca era um link com ?aba=, que refazia a página inteira no servidor.)
export function AbasItens({
  inicial,
  totalItens,
  semVinculo,
  todos,
  vincular,
  acoes,
}: {
  inicial: Aba
  totalItens: number
  semVinculo: number
  todos: React.ReactNode
  vincular: React.ReactNode
  acoes: React.ReactNode
}) {
  const [aba, setAba] = useState<Aba>(inicial)

  function botao(valor: Aba, rotulo: string, contagem: number) {
    const ativa = aba === valor
    return (
      <button
        type="button"
        role="tab"
        aria-selected={ativa}
        onClick={() => setAba(valor)}
        className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors ${
          ativa ? 'bg-papel font-medium text-grafite shadow-sm shadow-grafite/5' : 'text-ardosia hover:text-grafite'
        }`}
      >
        {rotulo}
        <span className={`leitura text-[11.5px] ${ativa ? 'text-ardosia' : 'text-ardosia-2'}`}>{contagem}</span>
      </button>
    )
  }

  return (
    <section className="painel">
      <div className="painel-topo">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="painel-titulo">Itens</h2>
          {totalItens > 0 && (
            <div role="tablist" aria-label="Filtrar itens" className="inline-flex rounded-lg border border-linha bg-nevoa p-0.5">
              {botao('todos', 'Todos', totalItens)}
              {botao('vincular', 'Sem vínculo', semVinculo)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      </div>
      <div role="tabpanel">{aba === 'vincular' ? vincular : todos}</div>
    </section>
  )
}
