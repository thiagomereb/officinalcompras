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
      className="btn btn-primario btn-sm"
    >
      {pending ? <span className="girador" aria-hidden="true" /> : <CheckCircle size={14} />}
      {pending ? 'Aprovando…' : 'Aprovar mapa'}
    </button>
  )
}
