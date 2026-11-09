import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buscarTodos } from '@/lib/supabase/consultas'
import { carregarPedidosComSinonimos } from '@/lib/pedidos'
import { ehFornecedorDeCompra } from '@/lib/fornecedores'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { AdicionarOrcamento } from '@/components/cotacoes-proprias/AdicionarOrcamento'
import { salvarOrcamento } from '../../../orcamentos-actions'

export default async function NovoOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cotacao }, todos, pedidos] = await Promise.all([
    supabase.from('cotacoes_proprias').select('numero').eq('id', id).single(),
    buscarTodos((de, ate) =>
      supabase
        .from('fornecedores')
        .select('id, razao_social, nome_fantasia, cnpj, codigo, credenciado, tipo')
        .eq('ativo', true)
        .order('razao_social')
        .order('id')
        .range(de, ate),
    ),
    carregarPedidosComSinonimos(supabase, id),
  ])
  if (!cotacao) notFound()

  // Só fornecedores de compra de insumos: transportadora, serviços e "outros"
  // não mandam orçamento de matéria-prima
  const fornecedores = todos.filter((f) => ehFornecedorDeCompra(f.tipo))

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
          fornecedores={fornecedores}
          pedidos={pedidos.map(({ id: pedidoId, codigo, nome, sinonimos }) => ({ id: pedidoId, codigo, nome, sinonimos }))}
          action={salvarOrcamento}
        />
      </div>
    </div>
  )
}
