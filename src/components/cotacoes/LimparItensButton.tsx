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
      <span role="alert" className="aviso aviso-erro basis-full py-2">
        <span className="flex-1">{erro}</span>
        <button onClick={() => { setErro(null); setConfirmando(false) }} className="font-medium underline-offset-2 hover:underline">
          Fechar
        </button>
      </span>
    )
  }

  if (!confirmando) {
    return (
      <button onClick={() => setConfirmando(true)} className="btn btn-fantasma btn-sm hover:text-oxido">
        <Trash2 size={14} />
        Limpar itens
      </button>
    )
  }

  return (
    <div className="inline-flex h-[30px] items-center gap-3 rounded-[7px] border border-oxido/30 bg-oxido-veu px-3 text-[12.5px] text-oxido">
      <span>Remover os {totalItens} itens?</span>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true)
          const resultado = await action(cotacaoId)
          setPending(false)
          if (resultado?.erro) setErro(resultado.erro)
          else setConfirmando(false)
        }}
        className="font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50"
      >
        {pending ? 'Removendo…' : 'Remover'}
      </button>
      <button
        onClick={() => setConfirmando(false)}
        disabled={pending}
        className="text-ardosia hover:text-grafite"
      >
        Cancelar
      </button>
    </div>
  )
}
