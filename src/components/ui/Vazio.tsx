import type { LucideIcon } from 'lucide-react'

interface Props {
  icone?: LucideIcon
  titulo: string
  texto?: React.ReactNode
  acao?: React.ReactNode
  // Dentro de um painel que já tem borda, sem moldura própria
  embutido?: boolean
}

export function Vazio({ icone: Icone, titulo, texto, acao, embutido = false }: Props) {
  return (
    <div className={`px-6 py-14 text-center ${embutido ? '' : 'painel'}`}>
      {Icone && <Icone size={22} strokeWidth={1.6} className="mx-auto mb-3 text-ardosia-2" />}
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-ardosia">{texto}</p>}
      {acao && <div className="mt-5 flex justify-center gap-2">{acao}</div>}
    </div>
  )
}
