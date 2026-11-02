'use client'

import { useState } from 'react'
import { Link2 } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  cotacaoId: string
  semVinculo: number
  action: (cotacaoId: string) => Promise<{ vinculados: number } | Falha>
}

export function VincularItensButton({ cotacaoId, semVinculo, action }: Props) {
  const [pending, setPending] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  if (semVinculo === 0) return null

  return (
    <div className="inline-flex items-center gap-2">
      {resultado && (
        <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">
          {resultado}
        </span>
      )}
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setResultado(null)
          const resultado = await action(cotacaoId)
          setResultado(
            'erro' in resultado
              ? `Erro: ${resultado.erro}`
              : resultado.vinculados > 0
                ? `${resultado.vinculados} item(ns) vinculado(s)`
                : 'Nenhum vínculo encontrado'
          )
          setPending(false)
        }}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors"
      >
        <Link2 size={14} />
        {pending ? 'Vinculando...' : `Vincular automaticamente (${semVinculo})`}
      </button>
    </div>
  )
}
