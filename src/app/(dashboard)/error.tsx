'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

// Fica dentro do layout do dashboard, então a sidebar continua utilizável
// quando uma página falha. Em produção o Next esconde a mensagem de erros do
// servidor; o digest permite achar o erro correspondente nos logs.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <div className="p-8">
      <div className="max-w-lg bg-white rounded-xl border border-red-200 p-6">
        <div className="flex items-center gap-2 text-red-700 font-semibold">
          <AlertTriangle size={18} />
          Algo deu errado ao carregar esta página
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Tente novamente. Se o problema continuar, informe o código abaixo ao suporte.
        </p>
        {digest && <p className="text-xs text-gray-400 font-mono mt-2">Código: {digest}</p>}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => retry()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Ir para o dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
