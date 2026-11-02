import { FornecedorForm } from '@/components/fornecedores/FornecedorForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { criarFornecedor } from '../actions'

export default function NovoFornecedorPage() {
  return (
    <div className="pagina">
      <Cabecalho voltar={{ href: '/fornecedores', label: 'Fornecedores' }} titulo="Novo fornecedor" />
      <div className="painel max-w-3xl p-5 lg:p-7">
        <FornecedorForm action={criarFornecedor} />
      </div>
    </div>
  )
}
