'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Tables } from '@/types/database'

type Fornecedor = Tables<'fornecedores'>
type Cotacao = Tables<'cotacoes'>

interface Props {
  fornecedores: Fornecedor[]
  cotacao?: Cotacao
  action: (formData: FormData) => Promise<void>
}

export function CotacaoForm({ fornecedores, cotacao, action }: Props) {
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

  const hoje = new Date().toISOString().split('T')[0]

  return (
    <form action={formAction} className="space-y-6" encType="multipart/form-data">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fornecedor <span className="text-red-500">*</span>
          </label>
          <select
            name="fornecedor_id"
            required
            defaultValue={cotacao?.fornecedor_id ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Selecione um fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia ?? f.razao_social}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Data da Cotação <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="data_cotacao"
            required
            defaultValue={cotacao?.data_cotacao ?? hoje}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Validade da Cotação</label>
          <input
            type="date"
            name="validade_cotacao"
            defaultValue={cotacao?.validade_cotacao ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {!cotacao && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arquivo da Cotação
              <span className="text-gray-400 font-normal ml-1">(PDF, Excel, Imagem)</span>
            </label>
            <input
              type="file"
              name="arquivo"
              accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Salvando...' : cotacao ? 'Salvar alterações' : 'Criar cotação'}
        </button>
        <Link
          href="/cotacoes"
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
