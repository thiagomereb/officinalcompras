import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buscarTodos } from '@/lib/supabase/consultas'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { AdicionarOrcamento } from '@/components/cotacoes-proprias/AdicionarOrcamento'
import { salvarOrcamento } from '../../../orcamentos-actions'

export default async function NovoOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cotacao }, { data: fornecedores }, pedidos] = await Promise.all([
    supabase.from('cotacoes_proprias').select('numero').eq('id', id).single(),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj').eq('ativo', true).order('razao_social'),
    buscarTodos((de, ate) =>
      supabase.from('cotacao_propria_itens').select('codigo, nome').eq('cotacao_propria_id', id).order('ordem').range(de, ate),
    ),
  ])
  if (!cotacao) notFound()

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: `/cotacoes-proprias/${id}`, label: `Cotação ${cotacao.numero}` }}
        titulo="Adicionar orçamento"
        descricao="A IA lê o orçamento do fornecedor e liga cada item a um produto pedido. Confira antes de salvar."
      />
      <div className="max-w-5xl">
        <AdicionarOrcamento
          cotacaoPropriaId={id}
          fornecedores={fornecedores ?? []}
          pedidos={Object.fromEntries(pedidos.map((p) => [p.codigo, p.nome]))}
          action={salvarOrcamento}
        />
      </div>
    </div>
  )
}
