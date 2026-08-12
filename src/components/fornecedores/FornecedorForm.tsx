'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Tables } from '@/types/database'

type Fornecedor = Tables<'fornecedores'>

interface Props {
  fornecedor?: Fornecedor
  action: (formData: FormData) => Promise<void>
}

function formatarCNPJ(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18)
}

function formatarTelefone(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15)
}

export function FornecedorForm({ fornecedor, action }: Props) {
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
            Razão Social <span className="text-red-500">*</span>
          </label>
          <input
            name="razao_social"
            required
            defaultValue={fornecedor?.razao_social}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Nome jurídico completo"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome Fantasia
          </label>
          <input
            name="nome_fantasia"
            defaultValue={fornecedor?.nome_fantasia ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Como o fornecedor é conhecido"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
          <input
            name="cnpj"
            defaultValue={fornecedor?.cnpj ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="00.000.000/0000-00"
            onChange={(e) => { e.target.value = formatarCNPJ(e.target.value) }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
          <input
            name="telefone"
            defaultValue={fornecedor?.telefone ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="(00) 00000-0000"
            onChange={(e) => { e.target.value = formatarTelefone(e.target.value) }}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
          <input
            name="email"
            type="email"
            defaultValue={fornecedor?.email ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="contato@fornecedor.com.br"
          />
        </div>

        {fornecedor && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="hidden"
                name="ativo"
                value="false"
              />
              <input
                type="checkbox"
                name="ativo"
                value="true"
                defaultChecked={fornecedor.ativo ?? true}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Fornecedor ativo</span>
            </label>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Salvando...' : fornecedor ? 'Salvar alterações' : 'Cadastrar fornecedor'}
        </button>
        <Link
          href="/fornecedores"
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
