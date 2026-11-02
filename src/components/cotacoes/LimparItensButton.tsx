'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  cotacaoId: string
  totalItens: number
  action: (cotacaoId: string) => Promise<Falha | void>
}

export function LimparItensButton({ cotacaoId, totalItens, action }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (totalItens === 0) return null

  if (erro) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        {erro}
        <button onClick={() => { setErro(null); setConfirmando(false) }} className="text-red-400 hover:text-red-600">
          Fechar
        </button>
      </span>
    )
  }

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
          const resultado = await action(cotacaoId)
          setPending(false)
          if (resultado?.erro) setErro(resultado.erro)
          else setConfirmando(false)
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
