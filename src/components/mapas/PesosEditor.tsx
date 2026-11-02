'use client'

import { useState } from 'react'
import type { Pesos } from '@/lib/comparacao'

// Tons de grafite para os critérios; o preço, que costuma decidir, fica no mais escuro
const CAMPOS: { key: keyof Pesos; label: string; cor: string }[] = [
  { key: 'preco', label: 'Preço', cor: 'bg-grafite' },
  { key: 'entrega', label: 'Prazo de entrega', cor: 'bg-grafite/60' },
  { key: 'pagamento', label: 'Prazo de pagamento', cor: 'bg-grafite/35' },
  { key: 'frete', label: 'Frete', cor: 'bg-grafite/15' },
]

export function PesosEditor({ inicial }: { inicial: Pesos }) {
  const [pesos, setPesos] = useState(inicial)
  const total = pesos.preco + pesos.entrega + pesos.pagamento + pesos.frete
  const valido = total === 100

  function set(campo: keyof Pesos, valor: number) {
    setPesos((p) => ({ ...p, [campo]: Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0)) }))
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CAMPOS.map(({ key, label, cor }) => (
          <div key={key}>
            <label htmlFor={`peso-${key}`} className="legenda flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-sm ${cor}`} aria-hidden="true" />
              {label}
            </label>
            <div className="relative">
              <input
                id={`peso-${key}`}
                type="number"
                name={`peso_${key}`}
                min={0}
                max={100}
                value={pesos[key]}
                onChange={(e) => set(key, Number(e.target.value))}
                className="campo leitura pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ardosia">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-nevoa" aria-hidden="true">
        {CAMPOS.map(({ key, cor }) => (
          <div key={key} className={`${cor} transition-all`} style={{ width: `${(pesos[key] / Math.max(total, 1)) * 100}%` }} />
        ))}
      </div>

      <p className={`text-[12.5px] ${valido ? 'text-salvia' : 'font-medium text-oxido'}`} role="status">
        Total: <span className="leitura">{total}%</span>
        {valido ? '' : ` — ajuste para somar 100% (${total > 100 ? `sobram ${total - 100}` : `faltam ${100 - total}`})`}
      </p>
    </div>
  )
}
