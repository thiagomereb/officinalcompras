'use client'

import { useState, useTransition } from 'react'
import { Ban } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

interface Props {
  id: string
  action: (id: string, motivo: string) => Promise<Falha | void>
}

// Cancelar tira a compra do histórico, mas o mapa continua registrado com o
// motivo — por isso o motivo é obrigatório
export function CancelarMapaButton({ id, action }: Props) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="btn btn-perigo btn-sm">
        <Ban size={14} />
        Cancelar mapa
      </button>
    )
  }

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault()
        setErro(null)
        startTransition(async () => {
          const r = await action(id, motivo)
          if (r?.erro) setErro(r.erro)
        })
      }}
    >
      <input
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={500}
        required
        placeholder="Motivo do cancelamento"
        aria-label="Motivo do cancelamento"
        className="campo campo-sm w-full sm:w-72"
      />
      <button type="submit" disabled={pending || !motivo.trim()} className="btn btn-perigo btn-sm">
        {pending && <span className="girador" aria-hidden="true" />}
        {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
      </button>
      <button type="button" onClick={() => setAberto(false)} disabled={pending} className="btn btn-fantasma btn-sm">
        Voltar
      </button>
      {erro && (
        <p role="alert" className="basis-full text-[12.5px] text-oxido">
          {erro}
        </p>
      )}
    </form>
  )
}
