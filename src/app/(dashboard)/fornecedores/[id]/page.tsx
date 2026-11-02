import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { FornecedorForm } from '@/components/fornecedores/FornecedorForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
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
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/fornecedores', label: 'Fornecedores' }}
        grupo="Fornecedor"
        titulo={fornecedor.nome_fantasia ?? fornecedor.razao_social}
        descricao={fornecedor.nome_fantasia ? fornecedor.razao_social : undefined}
        acoes={<ExcluirFornecedorButton id={id} action={excluirFornecedor} />}
      />

      <div className="painel max-w-3xl p-5 lg:p-7">
        <FornecedorForm fornecedor={fornecedor} action={action} />
      </div>
    </div>
  )
}
