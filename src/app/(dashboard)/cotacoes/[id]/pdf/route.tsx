import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { buscarTodos } from '@/lib/supabase/consultas'
import { CotacaoPdf } from '@/components/pdf/CotacaoPdf'
import { dataHora, nomeArquivo, respostaPdf } from '@/components/pdf/base'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: cotacao }, itens] = await Promise.all([
    supabase.from('cotacoes').select('*, fornecedores(razao_social, nome_fantasia)').eq('id', id).single(),
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_itens')
        .select('*, insumos(nome_padrao)')
        .eq('cotacao_id', id)
        .order('created_at')
        .order('id')
        .range(de, ate),
    ),
  ])
  if (!cotacao) return new Response('Cotação não encontrada.', { status: 404 })

  const f = cotacao.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
  const fornecedor = f?.nome_fantasia ?? f?.razao_social ?? 'Fornecedor'
  const { fornecedores: _fornecedor, ...dados } = cotacao
  void _fornecedor

  const pdf = await renderToBuffer(
    <CotacaoPdf
      cotacao={dados}
      fornecedor={fornecedor}
      itens={itens.map(({ insumos, ...item }) => ({
        ...item,
        insumo_nome: (insumos as { nome_padrao: string } | null)?.nome_padrao ?? null,
      }))}
      geradoEm={dataHora(new Date().toISOString())}
    />,
  )
  return respostaPdf(pdf, nomeArquivo('cotacao', `${fornecedor}-${cotacao.data_cotacao}`))
}
