import Link from 'next/link'
import { ChevronLeft, FileText, Plus } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PesosEditor } from '@/components/mapas/PesosEditor'
import { PESOS_PADRAO } from '@/lib/comparacao'
import { criarMapa } from '../actions'

export default async function NovoMapaPage() {
  const supabase = createServiceClient()
  const { data: cotacoes } = await supabase
    .from('cotacoes')
    .select('id, data_cotacao, fornecedores(razao_social, nome_fantasia), cotacao_itens(id)')
    .eq('status', 'processado')
    .order('data_cotacao', { ascending: false })

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/mapas" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ChevronLeft size={16} />
          Voltar para mapas
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo Mapa de Cotação</h2>
        <p className="text-gray-500 mt-1">Selecione as cotações e configure os pesos do algoritmo de comparação.</p>
      </div>

      {!cotacoes?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg">
          <FileText size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="font-semibold text-gray-900 mb-2">Nenhuma cotação com itens lançados</h3>
          <p className="text-gray-500 text-sm mb-2">
            Para criar um mapa de comparação você precisa ter cotações com itens registrados.
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Abra uma cotação existente e adicione pelo menos um item de preço.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/cotacoes/nova"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Nova cotação
            </Link>
            <Link
              href="/cotacoes"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Ver cotações
            </Link>
          </div>
        </div>
      ) : (
        <form action={criarMapa} className="space-y-8 max-w-3xl">
          {/* Título */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Identificação</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título do Mapa <span className="text-red-500">*</span>
            </label>
            <input
              name="titulo"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Compras Maio/2026 — Lote 1"
            />
          </div>

          {/* Cotações */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Cotações para comparar</h3>
            <p className="text-xs text-gray-400 mb-4">Selecione uma ou mais cotações com itens lançados.</p>
            <div className="space-y-2">
              {cotacoes.map((c) => {
                const fornecedor = c.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
                const totalItens = (c.cotacao_itens as { id: string }[])?.length ?? 0
                return (
                  <label key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" name="cotacoes_ids" value={c.id} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(c.data_cotacao + 'T12:00:00').toLocaleDateString('pt-BR')} · {totalItens} item(s)
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Pesos */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Pesos do Algoritmo</h3>
            <p className="text-xs text-gray-400 mb-4">A soma dos pesos deve ser 100%. Ajuste conforme a prioridade da sua farmácia.</p>
            <PesosEditor inicial={PESOS_PADRAO} />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Gerar comparação →
            </button>
            <Link href="/mapas" className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}
