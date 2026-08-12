import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Plus, FileText, Pencil, Clock, CheckCircle, AlertCircle, Paperclip } from 'lucide-react'
import { LancarPrecosModal } from '@/components/cotacoes/LancarPrecosModal'

const STATUS_CONFIG = {
  processando: { label: 'Aguardando itens', icon: Clock, cls: 'bg-yellow-50 text-yellow-700' },
  processado: { label: 'Itens lançados', icon: CheckCircle, cls: 'bg-green-50 text-green-700' },
  erro: { label: 'Erro', icon: AlertCircle, cls: 'bg-red-50 text-red-700' },
} as const

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default async function CotacoesPage() {
  const supabase = createServiceClient()

  const [{ data: cotacoes }, { data: fornecedores }, { data: insumos }] = await Promise.all([
    supabase
      .from('cotacoes')
      .select('*, fornecedores(razao_social, nome_fantasia), cotacao_itens(id)')
      .order('data_cotacao', { ascending: false }),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia').eq('ativo', true).order('razao_social'),
    supabase.from('insumos').select('id, nome_padrao, unidade_padrao').order('nome_padrao'),
  ])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cotações</h2>
          <p className="text-gray-500 mt-1">{cotacoes?.length ?? 0} cotação(ões) registrada(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <LancarPrecosModal
            fornecedores={fornecedores ?? []}
            insumos={insumos ?? []}
          />
          <Link
            href="/cotacoes/nova"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Nova cotação
          </Link>
        </div>
      </div>

      {!cotacoes?.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">Nenhuma cotação registrada</p>
          <p className="text-gray-400 text-sm mt-1">Clique em "Nova cotação" para começar</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fornecedor</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Validade</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Itens</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Condições</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cotacoes.map((c) => {
                const status = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.processando
                const StatusIcon = status.icon
                const fornecedor = c.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
                const totalItens = (c.cotacao_itens as { id: string }[])?.length ?? 0

                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(c.data_cotacao)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(c.validade_cotacao)}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-700">{totalItens}</span>
                      <span className="text-gray-400 ml-1">item(s)</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {c.prazo_entrega_dias && <div>Entrega: {c.prazo_entrega_dias}d</div>}
                        {c.prazo_pagamento_dias && <div>Pgto: {c.prazo_pagamento_dias}d</div>}
                        {c.frete_fixo && <div>Frete: R$ {c.frete_fixo.toFixed(2)}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                        <StatusIcon size={11} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {c.arquivo_url && (
                          <a
                            href={c.arquivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title={c.arquivo_nome ?? 'Arquivo'}
                          >
                            <Paperclip size={14} />
                          </a>
                        )}
                        <Link
                          href={`/cotacoes/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-xs"
                        >
                          <Pencil size={13} />
                          Abrir
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
