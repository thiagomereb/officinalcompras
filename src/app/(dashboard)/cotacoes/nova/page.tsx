import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CotacaoForm } from '@/components/cotacoes/CotacaoForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'
import { criarCotacao } from '../actions'

export default async function NovaCotacaoPage() {
  const supabase = await createClient()
  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('*')
    .eq('ativo', true)
    .order('razao_social')

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/cotacoes', label: 'Cotações' }}
        titulo="Nova cotação"
        descricao="Registre as condições do fornecedor e anexe a tabela de preços."
      />

      {!fornecedores?.length ? (
        <Vazio
          icone={Building2}
          titulo="Nenhum fornecedor ativo"
          texto="Cadastre o fornecedor antes de registrar a cotação dele."
          acao={
            <Link href="/fornecedores/novo" className="btn btn-primario btn-sm">
              Cadastrar fornecedor
            </Link>
          }
        />
      ) : (
        <div className="painel max-w-3xl p-5 lg:p-7">
          <CotacaoForm fornecedores={fornecedores} action={criarCotacao} />
        </div>
      )}
    </div>
  )
}
