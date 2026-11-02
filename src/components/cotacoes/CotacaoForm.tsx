'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Tables } from '@/types/database'
import type { Falha } from '@/lib/acoes'
import { enviarArquivoCotacao, removerArquivoCotacao, ACCEPT_ARQUIVO_COTACAO } from '@/lib/supabase/upload'

type Fornecedor = Tables<'fornecedores'>
type Cotacao = Tables<'cotacoes'>

interface Props {
  fornecedores: Fornecedor[]
  cotacao?: Cotacao
  action: (formData: FormData) => Promise<Falha | void>
}

type Estado = { erro: string | null; salvo: boolean }

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export function CotacaoForm({ fornecedores, cotacao, action }: Props) {
  const [estado, formAction, pending] = useActionState(
    async (_: Estado, formData: FormData): Promise<Estado> => {
      try {
        // O arquivo sobe direto do navegador para o storage; a action recebe
        // só o path (ver enviarArquivoCotacao).
        const arquivo = formData.get('arquivo')
        formData.delete('arquivo')
        let enviado: string | null = null
        if (arquivo instanceof File && arquivo.size > 0) {
          enviado = await enviarArquivoCotacao(arquivo, arquivo.name)
          formData.set('arquivo_path', enviado)
          formData.set('arquivo_nome', arquivo.name)
        }

        const resultado = await action(formData)
        if (resultado?.erro) {
          if (enviado) await removerArquivoCotacao(enviado)
          return { erro: resultado.erro, salvo: false }
        }
        return { erro: null, salvo: true }
      } catch (e) {
        return { erro: (e as Error).message, salvo: false }
      }
    },
    { erro: null, salvo: false }
  )

  const hoje = new Date().toISOString().split('T')[0]

  return (
    <form action={formAction} className="space-y-6">
      {estado.erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {estado.erro}
        </div>
      )}
      {cotacao && estado.salvo && !pending && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          Condições salvas.
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
            className={INPUT}
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
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Validade da Cotação</label>
          <input
            type="date"
            name="validade_cotacao"
            defaultValue={cotacao?.validade_cotacao ?? ''}
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prazo de Entrega (dias)</label>
          <input
            type="number"
            name="prazo_entrega_dias"
            min="0"
            step="1"
            placeholder="Ex: 7"
            defaultValue={cotacao?.prazo_entrega_dias ?? ''}
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prazo de Pagamento (dias)</label>
          <input
            type="number"
            name="prazo_pagamento_dias"
            min="0"
            step="1"
            placeholder="Ex: 30"
            defaultValue={cotacao?.prazo_pagamento_dias ?? ''}
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frete Fixo (R$)
            <span className="text-gray-400 font-normal ml-1">(vazio = grátis)</span>
          </label>
          <input
            type="number"
            name="frete_fixo"
            min="0"
            step="0.01"
            placeholder="0,00"
            defaultValue={cotacao?.frete_fixo ?? ''}
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Frete Grátis Acima de (R$)</label>
          <input
            type="number"
            name="frete_gratis_acima"
            min="0"
            step="0.01"
            placeholder="0,00"
            defaultValue={cotacao?.frete_gratis_acima ?? ''}
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pedido Mínimo (R$)</label>
          <input
            type="number"
            name="pedido_minimo"
            min="0"
            step="0.01"
            placeholder="0,00"
            defaultValue={cotacao?.pedido_minimo ?? ''}
            className={INPUT}
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
              accept={ACCEPT_ARQUIVO_COTACAO}
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
        {!cotacao && (
          <Link
            href="/cotacoes"
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}
