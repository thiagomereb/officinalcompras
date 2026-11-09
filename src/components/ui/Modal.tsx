'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

interface Props {
  aberto: boolean
  titulo: React.ReactNode
  onFechar: () => void
  children: React.ReactNode
  rodape?: React.ReactNode
  // 'medio' para escolhas rápidas; 'grande' ocupa quase a tela (tabelas)
  tamanho?: 'medio' | 'grande'
  // Enquanto algo está em andamento (salvando), Esc e o fundo não fecham
  travado?: boolean
}

// Janela por cima da página, no padrão do "Adicionar item": no celular sobe do
// rodapé; no computador fica centralizada
export function Modal({ aberto, titulo, onFechar, children, rodape, tamanho = 'medio', travado = false }: Props) {
  const idTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    painel.current?.focus()
    return () => {
      document.body.style.overflow = anterior
    }
  }, [aberto])

  if (!aberto) return null

  const largura = tamanho === 'grande' ? 'max-w-6xl sm:h-[92dvh]' : 'max-w-lg'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-grafite/40" onClick={() => !travado && onFechar()} aria-hidden="true" />
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !travado) onFechar()
        }}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-papel shadow-2xl shadow-grafite/20 outline-none sm:rounded-2xl ${largura}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-linha-2 px-6 py-4">
          <h2 id={idTitulo} className="titulo min-w-0 text-[18px]">
            {titulo}
          </h2>
          <button onClick={onFechar} disabled={travado} className="btn btn-fantasma btn-icone btn-sm shrink-0" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {rodape && <div className="border-t border-linha-2 px-6 py-4">{rodape}</div>}
      </div>
    </div>
  )
}
