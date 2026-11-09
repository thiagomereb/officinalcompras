'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import type { excluirOrcamento } from '@/app/(dashboard)/cotacoes-proprias/orcamentos-actions'

interface Props {
  orcamentoId: string
  cotacaoPropriaId: string
  action: typeof excluirOrcamento
}

export function ExcluirOrcamentoButton({ orcamentoId, cotacaoPropriaId, action }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <button
      onClick={() => {
        if (!confirm('Excluir este orçamento e todos os itens dele?')) return
        startTransition(async () => {
          const r = await action(orcamentoId, cotacaoPropriaId)
          if (r?.erro) {
            alert(r.erro)
            return
          }
          router.push(`/cotacoes-proprias/${cotacaoPropriaId}`)
        })
      }}
      disabled={pending}
      className="btn btn-perigo btn-sm"
    >
      {pending ? <span className="girador" aria-hidden="true" /> : <Trash2 size={14} />}
      {pending ? 'Excluindo…' : 'Excluir'}
    </button>
  )
}
