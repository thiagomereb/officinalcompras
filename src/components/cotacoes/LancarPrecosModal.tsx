'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2, ClipboardList } from 'lucide-react'
import { lancarPrecos } from '@/app/(dashboard)/cotacoes/actions'
import { ehFalha } from '@/lib/acoes'

type Fornecedor = { id: string; razao_social: string; nome_fantasia: string | null }
type Insumo = { id: string; nome_padrao: string; unidade_padrao: string }

interface ItemRow {
  insumo_id: string
  preco_unitario: string
  quantidade_embalagem: string
  unidade: string
}

const EMPTY_ROW: ItemRow = { insumo_id: '', preco_unitario: '', quantidade_embalagem: '', unidade: '' }

export function LancarPrecosModal({
  fornecedores,
  insumos,
}: {
  fornecedores: Fornecedor[]
  insumos: Insumo[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [fornecedorId, setFornecedorId] = useState('')
  const [dataCotacao, setDataCotacao] = useState(new Date().toISOString().split('T')[0])
  const [validadeCotacao, setValidadeCotacao] = useState('')
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [prazoPagamento, setPrazoPagamento] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ROW }])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function addRow() {
    setItems((prev) => [...prev, { ...EMPTY_ROW }])
  }

  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  function handleInsumoChange(i: number, insumoId: string) {
    const insumo = insumos.find((ins) => ins.id === insumoId)
    setItems((prev) =>
      prev.map((row, idx) =>
        idx === i ? { ...row, insumo_id: insumoId, unidade: insumo?.unidade_padrao ?? row.unidade } : row,
      ),
    )
  }

  function resetForm() {
    setFornecedorId('')
    setDataCotacao(new Date().toISOString().split('T')[0])
    setValidadeCotacao('')
    setPrazoEntrega('')
    setPrazoPagamento('')
    setItems([{ ...EMPTY_ROW }])
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
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
      >
        <ClipboardList size={16} />
        Lançar Preços
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900 text-base">Lançar Preços</h2>
                <p className="text-xs text-gray-500 mt-0.5">Cria uma nova cotação com os itens informados</p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Fornecedor + Datas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fornecedor <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={fornecedorId}
                      onChange={(e) => setFornecedorId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione o fornecedor...</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome_fantasia ?? f.razao_social}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data da Cotação</label>
                    <input
                      type="date"
                      value={dataCotacao}
                      onChange={(e) => setDataCotacao(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Validade da Cotação</label>
                    <input
                      type="date"
                      value={validadeCotacao}
                      onChange={(e) => setValidadeCotacao(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prazo de Entrega (dias)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 7"
                      value={prazoEntrega}
                      onChange={(e) => setPrazoEntrega(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prazo de Pagamento (dias)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 30"
                      value={prazoPagamento}
                      onChange={(e) => setPrazoPagamento(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">
                      Insumos
                      {validItems.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {validItems.length} item(s) válido(s)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={addRow}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Plus size={12} />
                      Adicionar linha
                    </button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_130px_110px_90px_36px] gap-2 px-1 mb-1.5">
                    <span className="text-xs font-medium text-gray-400">Insumo</span>
                    <span className="text-xs font-medium text-gray-400">Preço Unit. (R$)</span>
                    <span className="text-xs font-medium text-gray-400">Qtd/Embalagem</span>
                    <span className="text-xs font-medium text-gray-400">Unidade</span>
                    <span />
                  </div>

                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="grid grid-cols-[1fr_130px_110px_90px_36px] gap-2 items-center">
                        <select
                          value={item.insumo_id}
                          onChange={(e) => handleInsumoChange(i, e.target.value)}
                          className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 truncate"
                        >
                          <option value="">Selecione...</option>
                          {insumos.map((ins) => (
                            <option key={ins.id} value={ins.id}>
                              {ins.nome_padrao}
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          placeholder="0,0000"
                          value={item.preco_unitario}
                          onChange={(e) => updateRow(i, 'preco_unitario', e.target.value)}
                          className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Ex: 100"
                          value={item.quantidade_embalagem}
                          onChange={(e) => updateRow(i, 'quantidade_embalagem', e.target.value)}
                          className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <input
                          type="text"
                          placeholder="g, mL"
                          value={item.unidade}
                          onChange={(e) => updateRow(i, 'unidade', e.target.value)}
                          className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          disabled={items.length === 1}
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl shrink-0">
                <p className="text-xs text-gray-400">
                  Linhas sem insumo ou sem preço serão ignoradas
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {pending ? 'Salvando...' : 'Salvar cotação'}
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
