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

      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ex: Vitamina C, Ácido L-Ascórbico..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={adicionar}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus size={15} />
          Adicionar
        </button>
      </div>

      {sinonimos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sinonimos.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full"
            >
              {s}
              <button
                type="button"
                onClick={() => remover(i)}
                className="hover:text-blue-900 transition-colors"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {sinonimos.length === 0 && (
        <p className="text-xs text-gray-400">
          Adicione sinônimos para que o sistema reconheça nomes alternativos deste insumo.
        </p>
      )}
    </div>
  )
}
