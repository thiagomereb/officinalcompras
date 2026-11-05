'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { formatarCas } from '@/lib/cas'
import type { alterarCasItem } from '@/app/(dashboard)/cotacoes/actions'

interface Props {
  itemId: string
  cotacaoId: string
  cas: string | null
  action: typeof alterarCasItem
}

// Edita o CAS de um item da cotação na própria tabela (ex.: o OCR leu errado
// ou a planilha não trazia). Enter salva, Esc cancela, vazio apaga.
export function EditarCas({ itemId, cotacaoId, cas, action }: Props) {
  const exibido = formatarCas(cas)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function abrir() {
    setValor(exibido ?? '')
    setErro(null)
    setEditando(true)
  }

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await action(itemId, cotacaoId, valor)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      setEditando(false)
    })
  }

  if (!editando) {
    return (
      <div className="flex items-center gap-1">
        <span className="leitura text-[12px] text-ardosia">{exibido ?? '—'}</span>
        <button
          onClick={abrir}
          className="btn btn-fantasma btn-icone btn-sm h-6 w-6 opacity-40 group-hover/linha:opacity-100 focus-visible:opacity-100"
          title={exibido ? 'Editar o CAS' : 'Informar o CAS'}
          aria-label={exibido ? `Editar o CAS ${exibido}` : 'Informar o CAS'}
        >
          <Pencil size={13} />
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
      className="py-0.5"
    >
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditando(false)
          }}
          // readOnly e não disabled: o foco fica no campo para corrigir depois de um erro
          readOnly={pending}
          maxLength={100}
          placeholder="50-81-7"
          aria-label="Número CAS"
          aria-invalid={!!erro}
          className={`campo campo-sm leitura w-32 ${erro ? 'border-oxido' : ''}`}
        />
        <button type="submit" disabled={pending} className="btn btn-fantasma btn-icone btn-sm" title="Salvar" aria-label="Salvar o CAS">
          {pending ? <span className="girador" aria-hidden="true" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          disabled={pending}
          className="btn btn-fantasma btn-icone btn-sm"
          title="Cancelar (Esc)"
          aria-label="Cancelar"
        >
          <X size={14} />
        </button>
      </div>
      {erro && (
        <p role="alert" className="mt-1 max-w-[17rem] whitespace-normal text-[11.5px] text-oxido">
          {erro}
        </p>
      )}
    </form>
  )
}
