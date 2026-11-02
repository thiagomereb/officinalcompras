'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  id: string
  action: (id: string) => Promise<Falha | void>
}

export function ExcluirFornecedorButton({ id, action }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleExcluir() {
    if (!confirm('Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita.')) return

    startTransition(async () => {
      const resultado = await action(id)
      if (resultado?.erro) {
        alert(resultado.erro)
        return
      }
      router.push('/fornecedores')
    })
  }

  return (
    <button
      onClick={handleExcluir}
      disabled={pending}
      className="btn btn-perigo btn-sm"
    >
      {pending ? <span className="girador" aria-hidden="true" /> : <Trash2 size={14} />}
      {pending ? 'Excluindo…' : 'Excluir fornecedor'}
    </button>
  )
}
