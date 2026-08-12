'use client'

import { useState } from 'react'
import { Link2 } from 'lucide-react'

interface Props {
  cotacaoId: string
  semVinculo: number
  action: (cotacaoId: string) => Promise<{ vinculados: number }>
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
          const { vinculados } = await action(cotacaoId)
          setResultado(
            vinculados > 0
              ? `${vinculados} item(ns) vinculado(s)`
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
