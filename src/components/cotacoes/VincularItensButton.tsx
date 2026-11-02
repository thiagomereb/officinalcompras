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
        <span role="status" className="text-[12.5px] text-ardosia">
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
        className="btn btn-secundario btn-sm"
        title="Liga cada item sem vínculo ao insumo de nome ou sinônimo mais parecido"
      >
        {pending ? <span className="girador" aria-hidden="true" /> : <Link2 size={14} />}
        {pending ? 'Vinculando…' : `Vincular automaticamente (${semVinculo})`}
      </button>
    </div>
  )
}
