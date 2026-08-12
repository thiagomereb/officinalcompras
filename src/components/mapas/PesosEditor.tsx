'use client'

import { useState } from 'react'
import type { Pesos } from '@/lib/comparacao'

export function PesosEditor({ inicial }: { inicial: Pesos }) {
  const [pesos, setPesos] = useState(inicial)
  const total = pesos.preco + pesos.entrega + pesos.pagamento + pesos.frete
  const valido = total === 100

  function set(campo: keyof Pesos, valor: number) {
    setPesos((p) => ({ ...p, [campo]: Math.max(0, Math.min(100, valor)) }))
  }

  const campos: { key: keyof Pesos; label: string; cor: string }[] = [
    { key: 'preco', label: 'Preço', cor: 'bg-blue-500' },
    { key: 'entrega', label: 'Prazo Entrega', cor: 'bg-green-500' },
    { key: 'pagamento', label: 'Prazo Pagamento', cor: 'bg-purple-500' },
    { key: 'frete', label: 'Frete', cor: 'bg-orange-500' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {campos.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label} (%)</label>
            <input
              type="number"
              name={`peso_${key}`}
              min={0}
              max={100}
              value={pesos[key]}
              onChange={(e) => set(key, Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>

      {/* Barra visual */}
      <div className="h-3 rounded-full overflow-hidden flex bg-gray-100">
        {campos.map(({ key, cor }) => (
          <div
            key={key}
            className={`${cor} transition-all`}
            style={{ width: `${(pesos[key] / Math.max(total, 1)) * 100}%` }}
          />
        ))}
      </div>

      <p className={`text-xs font-medium ${valido ? 'text-green-600' : 'text-red-500'}`}>
        Total: {total}% {valido ? '✓' : '— deve somar 100%'}
      </p>
    </div>
  )
}
