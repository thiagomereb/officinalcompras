'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Falha } from '@/lib/acoes'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'

interface Props {
  cotacaoId: string
  action: (cotacaoId: string, formData: FormData) => Promise<Falha | void>
}

const UNIDADES: { value: string; label: string }[] = [
  { value: 'mg', label: 'mg — miligrama' },
  { value: 'g', label: 'g — grama' },
  { value: 'kg', label: 'kg — quilograma' },
  { value: 'mcg', label: 'mcg — micrograma' },
  { value: 'mL', label: 'mL — mililitro' },
  { value: 'L', label: 'L — litro' },
  { value: 'UI', label: 'UI — unidade internacional' },
  { value: 'un', label: 'un — unidade' },
  { value: 'cáps', label: 'cáps — cápsula' },
  { value: 'comp', label: 'comp — comprimido' },
]

export function AdicionarItemForm({ cotacaoId, action }: Props) {
  const [aberto, setAberto] = useState(false)
  const dialogo = useRef<HTMLDivElement>(null)

  const boundAction = action.bind(null, cotacaoId)
  const [error, formAction, pending] = useActionState(
    async (_: string | null, formData: FormData) => {
      try {
        const resultado = await boundAction(formData)
        if (resultado?.erro) return resultado.erro
        setAberto(false)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    null
  )

  useEffect(() => {
    if (aberto) dialogo.current?.querySelector<HTMLInputElement>('input[name="descricao_original"]')?.focus()
  }, [aberto])

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="btn btn-secundario btn-sm">
        <Plus size={15} />
        Adicionar item
      </button>
    )
  }

  const campo = (id: string) => `novo-item-${id}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-grafite/40" onClick={() => !pending && setAberto(false)} aria-hidden="true" />
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-novo-item"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !pending) setAberto(false)
        }}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-papel shadow-2xl shadow-grafite/20 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-linha-2 px-6 py-4">
          <h2 id="titulo-novo-item" className="titulo text-[18px]">
            Adicionar item
          </h2>
          <button onClick={() => setAberto(false)} className="btn btn-fantasma btn-icone btn-sm" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 grid-cols-1 gap-x-4 gap-y-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
            {error && (
              <p className="aviso aviso-erro sm:col-span-2" role="alert">
                {error}
              </p>
            )}

            <div className="sm:col-span-2">
              <label htmlFor={campo('descricao')} className="legenda">
                Descrição <span className="obrigatorio">*</span>
              </label>
              <input
                id={campo('descricao')}
                name="descricao_original"
                required
                className="campo"
                placeholder="Como aparece na tabela do fornecedor"
              />
            </div>

            <div className="sm:col-span-2">
              <span className="legenda">Insumo correspondente</span>
              <BuscaInsumo name="insumo_id" />
              <p className="ajuda">Sem escolha, o sistema tenta vincular pelo nome da descrição.</p>
            </div>

            <div>
              <label htmlFor={campo('preco')} className="legenda">
                Preço unitário (R$) <span className="obrigatorio">*</span>
              </label>
              <input
                id={campo('preco')}
                type="number"
                name="preco_unitario"
                required
                min="0"
                step="0.0001"
                className="campo leitura"
                placeholder="0,00"
              />
            </div>

            <div>
              <label htmlFor={campo('unidade')} className="legenda">Unidade</label>
              <select id={campo('unidade')} name="unidade" className="campo">
                <option value="">—</option>
                {UNIDADES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={campo('embalagem')} className="legenda">Tamanho da embalagem</label>
              <input
                id={campo('embalagem')}
                type="number"
                name="quantidade_minima"
                min="0"
                step="0.001"
                className="campo"
                placeholder="100"
              />
              <p className="ajuda">Na unidade escolhida: 100 para “100 g”.</p>
            </div>

            <div>
              <label htmlFor={campo('quantidade')} className="legenda">Quantidade</label>
              <input
                id={campo('quantidade')}
                type="number"
                name="quantidade"
                min="0"
                step="0.001"
                className="campo"
                placeholder="1"
              />
            </div>

            <div>
              <label htmlFor={campo('ipi')} className="legenda">IPI (%)</label>
              <input id={campo('ipi')} type="number" name="ipi" min="0" max="100" step="0.01" defaultValue="0" className="campo" />
            </div>

            <div>
              <label htmlFor={campo('st')} className="legenda">ST (%)</label>
              <input id={campo('st')} type="number" name="st" min="0" max="100" step="0.01" defaultValue="0" className="campo" />
            </div>

            <div>
              <label htmlFor={campo('cas')} className="legenda">CAS</label>
              <input id={campo('cas')} name="cas" className="campo leitura" placeholder="50-81-7" />
            </div>

            <div>
              <label htmlFor={campo('origem')} className="legenda">País de origem</label>
              <input id={campo('origem')} name="pais_origem" className="campo" placeholder="Brasil" />
            </div>

            <div>
              <label htmlFor={campo('lote')} className="legenda">Lote</label>
              <input id={campo('lote')} name="lote" className="campo leitura" placeholder="L2024001" />
            </div>

            <div>
              <label htmlFor={campo('validade')} className="legenda">Validade do lote</label>
              <input id={campo('validade')} type="date" name="validade" className="campo" />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-linha-2 bg-nevoa/60 px-6 py-3.5 sm:rounded-b-2xl">
            <button type="button" onClick={() => setAberto(false)} className="btn btn-secundario" disabled={pending}>
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="btn btn-primario">
              {pending && <span className="girador" aria-hidden="true" />}
              {pending ? 'Salvando…' : 'Salvar item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
