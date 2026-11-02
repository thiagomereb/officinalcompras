'use client'

import { useTransition } from 'react'
import { CheckCircle } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  id: string
  action: (id: string) => Promise<Falha | void>
}

export function AprovarMapaButton({ id, action }: Props) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => {
        if (!confirm('Aprovar este mapa? Após aprovação as seleções não poderão ser alteradas.')) return
        startTransition(async () => {
          const resultado = await action(id)
          if (resultado?.erro) alert(resultado.erro)
        })
      }}
      disabled={pending}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
    >
      <CheckCircle size={15} />
      {pending ? 'Aprovando...' : 'Aprovar mapa'}
    </button>
  )
}
