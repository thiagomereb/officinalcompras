'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface Props {
  inicial?: string[]
}

export function SinonimosEditor({ inicial = [] }: Props) {
  const [sinonimos, setSinonimos] = useState<string[]>(inicial)
  const [input, setInput] = useState('')

  function adicionar() {
    const valor = input.trim()
    if (!valor || sinonimos.includes(valor)) return
    setSinonimos([...sinonimos, valor])
    setInput('')
  }

  function remover(idx: number) {
    setSinonimos(sinonimos.filter((_, i) => i !== idx))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      adicionar()
    }
  }

  return (
    <div>
      <input type="hidden" name="sinonimos" value={JSON.stringify(sinonimos)} />

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Vitamina C, Ácido L-Ascórbico…"
          aria-label="Novo sinônimo"
          className="campo flex-1"
        />
        <button type="button" onClick={adicionar} className="btn btn-secundario">
          <Plus size={15} />
          Adicionar
        </button>
      </div>

      {sinonimos.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {sinonimos.map((s, i) => (
            <li
              key={s}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-linha bg-nevoa pl-2.5 pr-1 text-[13px]"
            >
              {s}
              <button
                type="button"
                onClick={() => remover(i)}
                className="grid h-5 w-5 place-items-center rounded text-ardosia transition-colors hover:bg-nevoa-2 hover:text-oxido"
                aria-label={`Remover sinônimo ${s}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ajuda">
          Nomes que aparecem nas tabelas dos fornecedores. Com eles, o sistema reconhece o insumo sozinho.
        </p>
      )}
    </div>
  )
}
