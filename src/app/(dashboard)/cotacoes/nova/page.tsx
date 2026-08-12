import Link from 'next/link'
import { ChevronLeft, Building2, Plus } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { CotacaoForm } from '@/components/cotacoes/CotacaoForm'
import { criarCotacao } from '../actions'

export default async function NovaCotacaoPage() {
  const supabase = createServiceClient()
  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('*')
    .eq('ativo', true)
    .order('razao_social')

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/cotacoes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft size={16} />
          Voltar para cotações
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Nova Cotação</h2>
        <p className="text-gray-500 mt-1">Registre as condições e faça o upload da tabela do fornecedor.</p>
      </div>

      {!fornecedores?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg">
          <Building2 size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="font-semibold text-gray-900 mb-2">Nenhum fornecedor cadastrado</h3>
          <p className="text-gray-500 text-sm mb-6">
            Cadastre pelo menos um fornecedor ativo antes de registrar uma cotação.
          </p>
          <Link
            href="/fornecedores/novo"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Cadastrar fornecedor
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <CotacaoForm fornecedores={fornecedores} action={criarCotacao} />
        </div>
      )}
    </div>
  )
}
