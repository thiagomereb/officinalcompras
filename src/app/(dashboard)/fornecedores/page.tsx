import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Building2, Mail, Phone, Pencil } from 'lucide-react'

export default async function FornecedoresPage() {
  const supabase = await createClient()
  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('*')
    .order('razao_social')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fornecedores</h2>
          <p className="text-gray-500 mt-1">{fornecedores?.length ?? 0} fornecedor(es) cadastrado(s)</p>
        </div>
        <Link
          href="/fornecedores/novo"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Novo fornecedor
        </Link>
      </div>

      {!fornecedores?.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Building2 size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">Nenhum fornecedor cadastrado</p>
          <p className="text-gray-400 text-sm mt-1">Clique em &ldquo;Novo fornecedor&rdquo; para começar</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fornecedor</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Contato</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">CNPJ</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fornecedores.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{f.razao_social}</p>
                    {f.nome_fantasia && (
                      <p className="text-gray-400 text-xs mt-0.5">{f.nome_fantasia}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {f.email && (
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Mail size={12} />
                          <span className="text-xs">{f.email}</span>
                        </div>
                      )}
                      {f.telefone && (
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Phone size={12} />
                          <span className="text-xs">{f.telefone}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{f.cnpj ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      f.ativo
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/fornecedores/${f.id}`}
                      className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-xs"
                    >
                      <Pencil size={13} />
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
