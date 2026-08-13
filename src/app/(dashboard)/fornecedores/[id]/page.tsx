import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { FornecedorForm } from '@/components/fornecedores/FornecedorForm'
import { atualizarFornecedor, excluirFornecedor } from '../actions'
import { ExcluirFornecedorButton } from './ExcluirFornecedorButton'

type Fornecedor = Tables<'fornecedores'>

export default async function EditarFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const result = await supabase.from('fornecedores').select('*').eq('id', id).single()
  const fornecedor = result.data as Fornecedor | null

  if (!fornecedor) notFound()

  const action = atualizarFornecedor.bind(null, id)

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/fornecedores"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft size={16} />
          Voltar para fornecedores
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{fornecedor.razao_social}</h2>
            {fornecedor.nome_fantasia && (
              <p className="text-gray-500 mt-0.5">{fornecedor.nome_fantasia}</p>
            )}
          </div>
          <ExcluirFornecedorButton id={id} action={excluirFornecedor} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <FornecedorForm fornecedor={fornecedor} action={action} />
      </div>
    </div>
  )
}
