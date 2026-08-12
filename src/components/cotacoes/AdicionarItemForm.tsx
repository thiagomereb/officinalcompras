'use client'

import { useActionState, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Tables } from '@/types/database'

type Insumo = Pick<Tables<'insumos'>, 'id' | 'nome_padrao'>

interface Props {
  cotacaoId: string
  insumos: Insumo[]
  action: (cotacaoId: string, formData: FormData) => Promise<void>
}

const UNIDADES: { value: string; label: string }[] = [
  { value: 'mg', label: 'mg — Miligrama' },
  { value: 'g', label: 'g — Grama' },
  { value: 'kg', label: 'kg — Quilograma' },
  { value: 'mcg', label: 'mcg — Micrograma' },
  { value: 'mL', label: 'mL — Mililitro' },
  { value: 'L', label: 'L — Litro' },
  { value: 'UI', label: 'UI — Unidade Internacional' },
  { value: 'un', label: 'un — Unidade' },
  { value: 'cáps', label: 'cáps — Cápsula' },
  { value: 'comp', label: 'comp — Comprimido' },
]

export function AdicionarItemForm({ cotacaoId, insumos, action }: Props) {
  const [aberto, setAberto] = useState(false)

  const boundAction = action.bind(null, cotacaoId)
  const [error, formAction, pending] = useActionState(
    async (_: string | null, formData: FormData) => {
      try {
        await boundAction(formData)
        setAberto(false)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    null
  )

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus size={16} />
        Adicionar item
      </button>
    )
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Novo Item</h4>
      <form action={formAction} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Descrição original <span className="text-red-500">*</span>
            </label>
            <input
              name="descricao_original"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Como aparece na tabela do fornecedor"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Insumo correspondente</label>
            <select
              name="insumo_id"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Não vinculado —</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>{i.nome_padrao}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Preço Unitário (R$) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="preco_unitario"
              required
              min="0"
              step="0.0001"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0,0000"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidade</label>
            <select
              name="unidade"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">—</option>
              {UNIDADES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantidade</label>
            <input
              type="number"
              name="quantidade"
              min="0"
              step="0.001"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: 100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Qtd. Mínima embalagem</label>
            <input
              type="number"
              name="quantidade_minima"
              min="0"
              step="0.001"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: 100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">País de Origem</label>
            <input
              name="pais_origem"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Brasil"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">IPI (%)</label>
            <input
              type="number"
              name="ipi"
              min="0"
              max="100"
              step="0.01"
              defaultValue="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ST (%)</label>
            <input
              type="number"
              name="st"
              min="0"
              max="100"
              step="0.01"
              defaultValue="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CAS</label>
            <input
              name="cas"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: 50-00-0"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lote</label>
            <input
              name="lote"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: L2024001"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Validade</label>
            <input
              type="date"
              name="validade"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Salvando...' : 'Salvar item'}
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
