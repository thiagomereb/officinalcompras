'use client'

import { useFormStatus } from 'react-dom'

// Botão de envio que reage no clique: desabilita e mostra o spinner enquanto a
// Server Action do formulário roda, sem precisar de estado no componente pai.
export function BotaoEnviar({
  children,
  pendente,
  className = 'btn btn-primario',
}: {
  children: React.ReactNode
  pendente: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending && <span className="girador" aria-hidden="true" />}
      {pending ? pendente : children}
    </button>
  )
}
