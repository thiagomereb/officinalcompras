'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'

interface Props {
  id: string
  cotacaoId: string
  action: (id: string, cotacaoId: string) => Promise<void>
}

export function RemoverItemButton({ id, cotacaoId, action }: Props) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => {
        if (!confirm('Remover este item?')) return
        startTransition(() => action(id, cotacaoId))
      }}
      disabled={pending}
      className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors rounded"
      title="Remover item"
    >
      <Trash2 size={14} />
    </button>
  )
}
