'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  id: string
  action: (id: string) => Promise<Falha | void>
}

export function ExcluirInsumoButton({ id, action }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleExcluir() {
    if (!confirm('Tem certeza que deseja excluir este insumo? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      const resultado = await action(id)
      if (resultado?.erro) {
        alert(resultado.erro)
        return
      }
      router.push('/insumos')
    })
  }

  return (
    <button
      onClick={handleExcluir}
      disabled={pending}
      className="btn btn-perigo btn-sm"
    >
      {pending ? <span className="girador" aria-hidden="true" /> : <Trash2 size={14} />}
      {pending ? 'Excluindo…' : 'Excluir insumo'}
    </button>
  )
}
