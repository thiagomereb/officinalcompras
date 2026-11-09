'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Falha } from '@/lib/acoes'

interface Props {
  action: (formData: FormData) => Promise<Falha | void>
  children: React.ReactNode
}

// Os campos (cotação própria, título) são renderizados no servidor e chegam como
// children; aqui fica só o envio e a mensagem de erro de validação.
export function NovoMapaForm({ action, children }: Props) {
  const [erro, formAction, pending] = useActionState(
    async (_: string | null, formData: FormData) => {
      try {
        const resultado = await action(formData)
        return resultado?.erro ?? null
      } catch (e) {
        return (e as Error).message
      }
    },
    null
  )

  return (
    <form action={formAction} className="max-w-3xl space-y-5">
      {children}

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primario">
          {pending && <span className="girador" aria-hidden="true" />}
          {pending ? 'Gerando…' : 'Gerar comparação'}
        </button>
        <Link href="/mapas" className="btn btn-secundario">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
