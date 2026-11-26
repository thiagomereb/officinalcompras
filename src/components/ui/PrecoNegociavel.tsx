'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { numeroDigitado } from '@/lib/numero'
import type { Falha } from '@/lib/acoes'

interface Props {
  // Preço da embalagem no orçamento do fornecedor
  precoOrcamento: number
  // O combinado com o fornecedor, quando houver
  precoNegociado: number | null
  // Quem é a oferta, para o leitor de tela
  rotulo: string
  // Grava o preço negociado (null volta ao do orçamento); ausente = só leitura
  gravar?: (preco: number | null) => Promise<Falha | void>
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// O preço de uma oferta: o negociado em verde, com o do orçamento riscado
// embaixo. O lápis abre o campo para digitar o preço combinado com o
// fornecedor; Enter grava, Esc cancela.
export function PrecoNegociavel({ precoOrcamento, precoNegociado, rotulo, gravar }: Props) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const vale = precoNegociado ?? precoOrcamento

  function abrir() {
    setValor(String(vale).replace('.', ','))
    setErro(null)
    setEditando(true)
  }

  function salvar(preco: number | null) {
    if (!gravar) return
    if (preco != null && !(preco > 0)) {
      setErro('Preço inválido')
      return
    }
    startTransition(async () => {
      const r = await gravar(preco)
      if (r?.erro) {
        setErro(r.erro)
        return
      }
      // A página recarrega com o preço novo (revalidatePath na action)
      setEditando(false)
    })
  }

  if (editando) {
    return (
      // Clique aqui não escolhe a oferta no mapa
      <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-ardosia">R$</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvar(numeroDigitado(valor))
              if (e.key === 'Escape') setEditando(false)
            }}
            onFocus={(e) => e.target.select()}
            inputMode="decimal"
            autoFocus
            disabled={pending}
            aria-label={`Preço negociado: ${rotulo}`}
            className="campo campo-sm leitura w-24 text-right"
          />
          <button
            type="button"
            onClick={() => salvar(numeroDigitado(valor))}
            disabled={pending}
            className="btn btn-primario btn-icone btn-sm h-7 w-7"
            title="Gravar o preço negociado"
            aria-label="Gravar o preço negociado"
          >
            {pending ? <span className="girador" aria-hidden="true" /> : <Check size={13} />}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            disabled={pending}
            className="btn btn-fantasma btn-icone btn-sm h-7 w-7"
            title="Cancelar"
            aria-label="Cancelar"
          >
            <X size={13} />
          </button>
        </div>
        {precoNegociado != null && (
          <button type="button" onClick={() => salvar(null)} disabled={pending} className="text-[11px] text-ardosia hover:underline">
            Voltar ao do orçamento ({moeda(precoOrcamento)})
          </button>
        )}
        {erro && <span className="text-[11px] text-oxido">{erro}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-start justify-end gap-1">
      <div>
        <span className={`leitura ${precoNegociado != null ? 'font-medium text-salvia' : ''}`}>{moeda(vale)}</span>
        {precoNegociado != null && (
          <div className="text-[11px] text-ardosia" title="Preço do orçamento do fornecedor, antes da negociação">
            negociado · orç. <span className="leitura line-through">{moeda(precoOrcamento)}</span>
          </div>
        )}
      </div>
      {gravar && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            abrir()
          }}
          className="btn btn-fantasma btn-icone btn-sm h-6 w-6 opacity-40 hover:opacity-100 focus-visible:opacity-100"
          title="Negociar o preço com o fornecedor"
          aria-label={`Negociar o preço: ${rotulo}`}
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  )
}
