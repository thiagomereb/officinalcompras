import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { carregarPedidosComSinonimos } from '@/lib/pedidos'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { AdicionarOrcamento } from '@/components/cotacoes-proprias/AdicionarOrcamento'
import { salvarOrcamento } from '../../../orcamentos-actions'

export default async function NovoOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cotacao }, { data: fornecedores }, pedidos] = await Promise.all([
    supabase.from('cotacoes_proprias').select('numero').eq('id', id).single(),
    supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj, codigo').eq('ativo', true).order('razao_social'),
    carregarPedidosComSinonimos(supabase, id),
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
          pedidos={pedidos.map(({ id: pedidoId, codigo, nome, sinonimos }) => ({ id: pedidoId, codigo, nome, sinonimos }))}
          action={salvarOrcamento}
        />
      </div>
    </div>
  )
}
