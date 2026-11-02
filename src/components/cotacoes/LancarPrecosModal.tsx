'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2, ClipboardList } from 'lucide-react'
import { lancarPrecos } from '@/app/(dashboard)/cotacoes/actions'
import { ehFalha } from '@/lib/acoes'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'

type Fornecedor = { id: string; razao_social: string; nome_fantasia: string | null }

interface ItemRow {
  // Chave estável: com o índice, remover uma linha trocaria o texto da busca das outras
  chave: number
  insumo_id: string
  preco_unitario: string
  quantidade_embalagem: string
  unidade: string
}

const linhaVazia = (chave: number): ItemRow => ({
  chave,
  insumo_id: '',
  preco_unitario: '',
  quantidade_embalagem: '',
  unidade: '',
})

// Data local (toISOString seria UTC: depois das 21h já marcaria amanhã)
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LancarPrecosModal({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [fornecedorId, setFornecedorId] = useState('')
  const [dataCotacao, setDataCotacao] = useState(hojeISO)
  const [validadeCotacao, setValidadeCotacao] = useState('')
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [prazoPagamento, setPrazoPagamento] = useState('')
  const [items, setItems] = useState<ItemRow[]>([linhaVazia(0)])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const dialogo = useRef<HTMLDivElement>(null)
  const proximaChave = useRef(1)

  // Ao abrir, o foco entra no diálogo (Esc e Tab passam a agir nele)
  useEffect(() => {
    if (open) dialogo.current?.focus()
  }, [open])

  function addRow() {
    setItems((prev) => [...prev, linhaVazia(proximaChave.current++)])
  }

  function removeRow(chave: number) {
    setItems((prev) => prev.filter((row) => row.chave !== chave))
  }

  function updateRow(chave: number, campo: 'preco_unitario' | 'quantidade_embalagem' | 'unidade', value: string) {
    setItems((prev) => prev.map((row) => (row.chave === chave ? { ...row, [campo]: value } : row)))
  }

  function handleInsumo(chave: number, insumoId: string, unidadePadrao: string | null) {
    setItems((prev) =>
      prev.map((row) =>
        row.chave === chave ? { ...row, insumo_id: insumoId, unidade: unidadePadrao ?? row.unidade } : row,
      ),
    )
  }

  function resetForm() {
    setFornecedorId('')
    setDataCotacao(hojeISO())
    setValidadeCotacao('')
    setPrazoEntrega('')
    setPrazoPagamento('')
    setItems([linhaVazia(proximaChave.current++)])
    setError(null)
  }

  function handleClose() {
    setOpen(false)
    resetForm()
  }

  const validItems = items.filter((item) => item.insumo_id && item.preco_unitario)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fornecedorId) {
      setError('Selecione um fornecedor.')
      return
    }
    if (validItems.length === 0) {
      setError('Adicione pelo menos um insumo com preço.')
      return
    }

    startTransition(async () => {
      try {
        const resultado = await lancarPrecos({
          fornecedor_id: fornecedorId,
          data_cotacao: dataCotacao,
          validade_cotacao: validadeCotacao || null,
          prazo_entrega_dias: prazoEntrega ? Number(prazoEntrega) : null,
          prazo_pagamento_dias: prazoPagamento ? Number(prazoPagamento) : null,
          items: validItems.map((item) => ({
            insumo_id: item.insumo_id,
            preco_unitario: parseFloat(item.preco_unitario),
            quantidade_embalagem: item.quantidade_embalagem ? parseFloat(item.quantidade_embalagem) : null,
            unidade: item.unidade || null,
          })),
        })
        if (ehFalha(resultado)) {
          setError(resultado.erro)
          return
        }
        handleClose()
        router.refresh()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-secundario">
        <ClipboardList size={16} />
        Lançar preços
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-grafite/40" onClick={() => !pending && handleClose()} aria-hidden="true" />

          <div
            ref={dialogo}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-lancar-precos"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !pending) handleClose()
            }}
            className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-papel shadow-2xl shadow-grafite/20 outline-none sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-linha-2 px-6 py-4">
              <div>
                <h2 id="titulo-lancar-precos" className="titulo text-[18px]">
                  Lançar preços
                </h2>
                <p className="mt-0.5 text-[12.5px] text-ardosia">
                  Cria uma cotação já com os itens, sem arquivo — para preços passados por telefone ou e-mail.
                </p>
              </div>
              <button onClick={handleClose} className="btn btn-fantasma btn-icone btn-sm" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {error && (
                  <p className="aviso aviso-erro" role="alert">
                    {error}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="lp-fornecedor" className="legenda">
                      Fornecedor <span className="obrigatorio">*</span>
                    </label>
                    <select
                      id="lp-fornecedor"
                      value={fornecedorId}
                      onChange={(e) => setFornecedorId(e.target.value)}
                      className="campo"
                    >
                      <option value="">Selecione o fornecedor</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome_fantasia ?? f.razao_social}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lp-data" className="legenda">Data da cotação</label>
                    <input id="lp-data" type="date" value={dataCotacao} onChange={(e) => setDataCotacao(e.target.value)} className="campo" />
                  </div>
                  <div>
                    <label htmlFor="lp-validade" className="legenda">Validade da cotação</label>
                    <input id="lp-validade" type="date" value={validadeCotacao} onChange={(e) => setValidadeCotacao(e.target.value)} className="campo" />
                  </div>
                  <div>
                    <label htmlFor="lp-entrega" className="legenda">Prazo de entrega (dias)</label>
                    <input id="lp-entrega" type="number" min="0" step="1" placeholder="7" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} className="campo" />
                  </div>
                  <div>
                    <label htmlFor="lp-pagamento" className="legenda">Prazo de pagamento (dias)</label>
                    <input id="lp-pagamento" type="number" min="0" step="1" placeholder="30" value={prazoPagamento} onChange={(e) => setPrazoPagamento(e.target.value)} className="campo" />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="rotulo">Itens</p>
                    <span className="text-[12px] text-ardosia">{validItems.length} com insumo e preço</span>
                  </div>

                  <div className="hidden grid-cols-[1fr_118px_100px_76px_32px] gap-2 px-0.5 pb-1.5 text-[11.5px] text-ardosia sm:grid">
                    <span>Insumo</span>
                    <span>Preço (R$)</span>
                    <span>Embalagem</span>
                    <span>Unidade</span>
                    <span />
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.chave}
                        className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 border-b border-linha-2 pb-2 sm:grid-cols-[1fr_118px_100px_76px_32px] sm:border-0 sm:pb-0"
                      >
                        <div className="col-span-4 sm:col-span-1">
                          <BuscaInsumo
                            compacto
                            onSelecionar={(insumo) => handleInsumo(item.chave, insumo.id, insumo.unidade_padrao)}
                          />
                        </div>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          placeholder="0,00"
                          aria-label="Preço unitário"
                          value={item.preco_unitario}
                          onChange={(e) => updateRow(item.chave, 'preco_unitario', e.target.value)}
                          className="campo campo-sm leitura"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="100"
                          aria-label="Quantidade da embalagem"
                          value={item.quantidade_embalagem}
                          onChange={(e) => updateRow(item.chave, 'quantidade_embalagem', e.target.value)}
                          className="campo campo-sm"
                        />
                        <input
                          type="text"
                          placeholder="g"
                          aria-label="Unidade"
                          value={item.unidade}
                          onChange={(e) => updateRow(item.chave, 'unidade', e.target.value)}
                          className="campo campo-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(item.chave)}
                          disabled={items.length === 1}
                          className="btn btn-fantasma btn-icone btn-sm self-center"
                          aria-label="Remover linha"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addRow} className="btn btn-fantasma btn-sm mt-2 -ml-2">
                    <Plus size={14} />
                    Adicionar linha
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha-2 bg-nevoa/60 px-6 py-3.5 sm:rounded-b-2xl">
                <p className="text-[12px] text-ardosia">Linhas sem insumo ou sem preço não entram.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleClose} className="btn btn-secundario" disabled={pending}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={pending} className="btn btn-primario">
                    {pending && <span className="girador" aria-hidden="true" />}
                    {pending ? 'Salvando…' : 'Salvar cotação'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
