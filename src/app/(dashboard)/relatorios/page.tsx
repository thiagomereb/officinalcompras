import { createServiceClient } from '@/lib/supabase/server'
import { BarChart3, FileDown, TrendingDown, Package, Building2, FileText } from 'lucide-react'
import Link from 'next/link'

export default async function RelatoriosPage() {
  const supabase = createServiceClient()

  const [
    { count: totalFornecedores },
    { count: totalInsumos },
    { count: totalCotacoes },
    { count: totalMapas },
    { count: mapaAprovados },
  ] = await Promise.all([
    supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('insumos').select('*', { count: 'exact', head: true }),
    supabase.from('cotacoes').select('*', { count: 'exact', head: true }),
    supabase.from('mapas_cotacao').select('*', { count: 'exact', head: true }),
    supabase.from('mapas_cotacao').select('*', { count: 'exact', head: true }).eq('status', 'aprovado'),
  ])

  const resumo = [
    { label: 'Fornecedores Ativos', value: totalFornecedores ?? 0, icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { label: 'Insumos Cadastrados', value: totalInsumos ?? 0, icon: Package, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Cotações Recebidas', value: totalCotacoes ?? 0, icon: FileText, color: 'text-purple-600 bg-purple-50' },
    { label: 'Mapas Gerados', value: totalMapas ?? 0, icon: BarChart3, color: 'text-orange-600 bg-orange-50' },
    { label: 'Mapas Aprovados', value: mapaAprovados ?? 0, icon: TrendingDown, color: 'text-green-600 bg-green-50' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <p className="text-gray-500 mt-1">Visão consolidada e exportação de dados</p>
      </div>

      {/* Resumo geral */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {resumo.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className={`inline-flex p-2 rounded-lg ${color} mb-2`}>
              <Icon size={16} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Relatórios disponíveis */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Exportar dados</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          {[
            { title: 'Mapas de Cotação Aprovados', desc: 'Todos os mapas com status aprovado em PDF', href: '/mapas' },
            { title: 'Lista de Fornecedores', desc: 'Dados cadastrais dos fornecedores ativos', href: '/fornecedores' },
            { title: 'Catálogo de Insumos', desc: 'Tabela mestre de insumos e sinônimos', href: '/insumos' },
            { title: 'Histórico de Cotações', desc: 'Todas as cotações recebidas com preços', href: '/cotacoes' },
          ].map(({ title, desc, href }) => (
            <Link
              key={title}
              href={href}
              className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                <FileDown size={15} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 max-w-2xl">
        <div className="flex items-start gap-3">
          <BarChart3 size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Exportação em CSV/Excel em breve</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Por enquanto, acesse os Mapas aprovados para imprimir ou salvar em PDF individualmente
              via o botão "Imprimir / Salvar PDF" em cada mapa.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
