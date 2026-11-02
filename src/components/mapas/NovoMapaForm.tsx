'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Falha } from '@/lib/acoes'

interface Props {
  action: (formData: FormData) => Promise<Falha | void>
  children: React.ReactNode
}

// Os campos (cotações, pesos) são renderizados no servidor e chegam como
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
    <form action={formAction} className="space-y-8 max-w-3xl">
      {children}

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {erro}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Gerando...' : 'Gerar comparação →'}
        </button>
        <Link href="/mapas" className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
