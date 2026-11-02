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
    <div className="pagina">
      <div className="painel max-w-lg p-6">
        <p className="flex items-center gap-2 font-semibold text-oxido">
          <AlertTriangle size={17} />
          Esta página não carregou
        </p>
        <p className="mt-2 text-[13.5px] text-ardosia">
          Tente de novo. Se continuar falhando, passe o código abaixo para quem cuida do sistema.
        </p>
        {digest && <p className="leitura mt-2 text-[12px] text-ardosia">Código: {digest}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={() => retry()} className="btn btn-primario">
            Tentar de novo
          </button>
          <Link href="/dashboard" className="btn btn-secundario">
            Ir para o painel
          </Link>
        </div>
      </div>
    </div>
  )
}
