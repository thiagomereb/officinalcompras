'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { SinonimosEditor } from './SinonimosEditor'
import type { Tables } from '@/types/database'

type Insumo = Tables<'insumos'>
type Sinonimo = Tables<'insumo_sinonimos'>

const UNIDADES = ['g', 'kg', 'mg', 'mcg', 'mL', 'L', 'UI', 'un', 'cáps', 'comp']

interface Props {
  insumo?: Insumo
  sinonimos?: Sinonimo[]
  action: (formData: FormData) => Promise<void>
}

export function InsumoForm({ insumo, sinonimos = [], action }: Props) {
  const [error, formAction, pending] = useActionState(
    async (_: string | null, formData: FormData) => {
      try {
        await action(formData)
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    null
  )

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome Padrão <span className="text-red-500">*</span>
          </label>
          <input
            name="nome_padrao"
            required
            defaultValue={insumo?.nome_padrao}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ex: Ácido Ascórbico"
          />
          <p className="text-xs text-gray-400 mt-1">Nome oficial que será usado em todo o sistema.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CAS Number</label>
          <input
            name="cas_number"
            defaultValue={insumo?.cas_number ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            placeholder="Ex: 50-81-7"
          />
          <p className="text-xs text-gray-400 mt-1">Código químico único para deduplicação.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Unidade Padrão <span className="text-red-500">*</span>
          </label>
          <select
            name="unidade_padrao"
            defaultValue={insumo?.unidade_padrao ?? 'g'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <textarea
            name="descricao"
            defaultValue={insumo?.descricao ?? ''}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Observações sobre este insumo..."
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sinônimos / Nomes Alternativos
          </label>
          <SinonimosEditor inicial={sinonimos.map((s) => s.sinonimo)} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Salvando...' : insumo ? 'Salvar alterações' : 'Cadastrar insumo'}
        </button>
        <Link
          href="/insumos"
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
