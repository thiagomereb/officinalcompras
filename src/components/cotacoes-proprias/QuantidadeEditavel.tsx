'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { numeroDigitado } from '@/lib/numero'
import { UNIDADES_QUANTIDADE, ehUnidadeQuantidade, normalizarUnidade, type UnidadeQuantidade } from '@/lib/unidades'
import type { Falha } from '@/lib/acoes'

interface Props {
  quantidade: number
  unidade: string
  // Nome do produto, para o leitor de tela
  rotulo: string
  // Grava a quantidade nova; ausente = só leitura (cotação com mapa aprovado)
  gravar?: (quantidade: number, unidade: string) => Promise<Falha | void>
}

const quantidadeBR = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
// Para o campo: sem ponto de milhar, vírgula decimal ("1000", "12,092")
const paraCampo = (n: number) => String(n).replace('.', ',')

// A quantidade pedida de um produto da cotação, com o lápis para corrigir:
// Enter grava, Esc cancela
export function QuantidadeEditavel({ quantidade, unidade, rotulo, gravar }: Props) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [unidadeNova, setUnidadeNova] = useState<UnidadeQuantidade>('g')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function abrir() {
    setValor(paraCampo(quantidade))
    const u = normalizarUnidade(unidade)
    setUnidadeNova(ehUnidadeQuantidade(u) ? u : 'g')
    setErro(null)
    setEditando(true)
  }

  function salvar() {
    if (!gravar) return
    const q = numeroDigitado(valor)
    if (q == null || !(q > 0)) {
      setErro('Quantidade inválida')
      return
    }
    startTransition(async () => {
      const r = await gravar(q, unidadeNova)
      if (r?.erro) {
        setErro(r.erro)
        return
      }
      // A página recarrega com a quantidade nova (revalidatePath na action)
      setEditando(false)
    })
  }

  if (editando) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvar()
              if (e.key === 'Escape') setEditando(false)
            }}
            onFocus={(e) => e.target.select()}
            inputMode="decimal"
            autoFocus
            disabled={pending}
            aria-label={`Quantidade pedida de ${rotulo}`}
            className="campo campo-sm leitura w-24 text-right"
          />
          <select
            value={unidadeNova}
            onChange={(e) => setUnidadeNova(e.target.value as UnidadeQuantidade)}
            disabled={pending}
            aria-label={`Unidade da quantidade de ${rotulo}`}
            className="campo campo-sm w-16"
          >
            {UNIDADES_QUANTIDADE.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={salvar}
            disabled={pending}
            className="btn btn-primario btn-icone btn-sm h-7 w-7"
            title="Gravar a quantidade"
            aria-label="Gravar a quantidade"
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
        {erro && <span className="text-[11px] text-oxido">{erro}</span>}
      </div>
    )
  }

  return (
    <span className="inline-flex items-center justify-end gap-1">
      <span className="leitura">
        {quantidadeBR(quantidade)} {unidade}
      </span>
      {gravar && (
        <button
          type="button"
          onClick={abrir}
          className="btn btn-fantasma btn-icone btn-sm h-6 w-6 opacity-40 hover:opacity-100 focus-visible:opacity-100"
          title="Mudar a quantidade pedida"
          aria-label={`Mudar a quantidade pedida de ${rotulo}`}
        >
          <Pencil size={12} />
        </button>
      )}
    </span>
  )
}
