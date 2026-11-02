'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  id: string
  cotacaoId: string
  action: (id: string, cotacaoId: string) => Promise<Falha | void>
}

export function RemoverItemButton({ id, cotacaoId, action }: Props) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => {
        if (!confirm('Remover este item?')) return
        startTransition(async () => {
          const resultado = await action(id, cotacaoId)
          if (resultado?.erro) alert(resultado.erro)
        })
      }}
      disabled={pending}
      className="btn btn-fantasma btn-icone btn-sm hover:text-oxido"
      title="Remover item"
      aria-label="Remover item"
    >
      {pending ? <span className="girador" aria-hidden="true" /> : <Trash2 size={14} />}
    </button>
  )
}
