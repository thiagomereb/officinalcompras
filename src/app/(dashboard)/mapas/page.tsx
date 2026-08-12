import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Plus, BarChart3, Pencil, CheckCircle, FileText, Clock } from 'lucide-react'

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', icon: Clock, cls: 'bg-gray-100 text-gray-600' },
  aprovado: { label: 'Aprovado', icon: CheckCircle, cls: 'bg-green-50 text-green-700' },
  exportado: { label: 'Exportado', icon: FileText, cls: 'bg-blue-50 text-blue-700' },
} as const

export default async function MapasPage() {
  const supabase = createServiceClient()
  const { data: mapas } = await supabase
    .from('mapas_cotacao')
    .select('*, mapa_cotacao_itens(id)')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mapas de Cotação</h2>
          <p className="text-gray-500 mt-1">{mapas?.length ?? 0} mapa(s) gerado(s)</p>
        </div>
        <Link
          href="/mapas/novo"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Novo mapa
        </Link>
      </div>

      {!mapas?.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <BarChart3 size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">Nenhum mapa gerado</p>
          <p className="text-gray-400 text-sm mt-1">Crie um mapa para comparar cotações e gerar o relatório final</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Título</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Cotações</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Itens</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Criado em</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mapas.map((m) => {
                const status = STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.rascunho
                const StatusIcon = status.icon
                const totalItens = (m.mapa_cotacao_itens as { id: string }[])?.length ?? 0

                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{m.titulo}</td>
                    <td className="px-6 py-4 text-gray-500">{m.cotacoes_ids.length} cotação(ões)</td>
                    <td className="px-6 py-4 text-gray-500">{totalItens} item(s)</td>
                    <td className="px-6 py-4 text-gray-500">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                        <StatusIcon size={11} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/mapas/${m.id}`}
                        className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-xs"
                      >
                        <Pencil size={13} />
                        Abrir
                      </Link>
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
