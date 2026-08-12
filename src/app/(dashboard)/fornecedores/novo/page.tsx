import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { FornecedorForm } from '@/components/fornecedores/FornecedorForm'
import { criarFornecedor } from '../actions'

export default function NovoFornecedorPage() {
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
        <h2 className="text-2xl font-bold text-gray-900">Novo Fornecedor</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <FornecedorForm action={criarFornecedor} />
      </div>
    </div>
  )
}
