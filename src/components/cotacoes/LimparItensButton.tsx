'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

interface Props {
  cotacaoId: string
  totalItens: number
  action: (cotacaoId: string) => Promise<void>
}

export function LimparItensButton({ cotacaoId, totalItens, action }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [pending, setPending] = useState(false)

  if (totalItens === 0) return null

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
      >
        <Trash2 size={14} />
        Limpar itens
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <span>Remover todos os {totalItens} itens?</span>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true)
          await action(cotacaoId)
        }}
        className="font-semibold underline hover:no-underline disabled:opacity-50"
      >
        {pending ? 'Removendo...' : 'Confirmar'}
      </button>
      <button
        onClick={() => setConfirmando(false)}
        className="text-red-400 hover:text-red-600"
      >
        Cancelar
      </button>
    </div>
  )
}
