import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

interface Props {
  // Seção da navegação a que a página pertence (Compras, Cadastros, Sistema)
  grupo?: string
  titulo: React.ReactNode
  descricao?: React.ReactNode
  acoes?: React.ReactNode
  voltar?: { href: string; label: string }
}

export function Cabecalho({ grupo, titulo, descricao, acoes, voltar }: Props) {
  return (
    <header className="mb-6">
      {voltar && (
        <Link
          href={voltar.href}
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-ardosia transition-colors hover:text-grafite"
        >
          <ChevronLeft size={15} />
          {voltar.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {grupo && <p className="rotulo mb-1.5">{grupo}</p>}
          <h1 className="titulo text-[24px] leading-tight lg:text-[27px]">{titulo}</h1>
          {descricao && <div className="mt-1 text-[13.5px] text-ardosia">{descricao}</div>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  )
}
