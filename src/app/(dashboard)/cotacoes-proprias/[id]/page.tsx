import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Paperclip, Plus, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'
import { buscarTodos } from '@/lib/supabase/consultas'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'
import { ProdutosCotacaoPropria, type ProdutoPedido } from '@/components/cotacoes-proprias/ProdutosCotacaoPropria'
import { ExcluirCotacaoPropriaButton } from './ExcluirCotacaoPropriaButton'
import { excluirCotacaoPropria } from '../actions'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataCurta = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export default async function CotacaoPropriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cotacao } = await supabase.from('cotacoes_proprias').select('*').eq('id', id).single()
  if (!cotacao) notFound()

  const [itens, arquivoUrl, { data: orcamentos }] = await Promise.all([
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_propria_itens')
        .select('id, codigo, ean, nome, teor, quantidade, unidade, insumo_id, insumos(created_at)')
        .eq('cotacao_propria_id', id)
        .order('ordem')
        .range(de, ate),
    ),
    getArquivoSignedUrl(supabase, cotacao.arquivo_url),
    supabase
      .from('cotacoes')
      .select('id, numero_orcamento, data_cotacao, total_documento, fornecedores(razao_social, nome_fantasia), cotacao_itens(cotacao_propria_item_id, vinculo_origem)')
      .eq('cotacao_propria_id', id)
      .order('created_at'),
  ])

  // Quantos orçamentos trazem cada produto pedido
  const ofertasPorPedido = new Map<string, Set<string>>()
  const linhasOrcamento = (orcamentos ?? []).map((o) => {
    const itensOrc = (o.cotacao_itens ?? []) as { cotacao_propria_item_id: string | null; vinculo_origem: string | null }[]
    for (const i of itensOrc) {
      if (!i.cotacao_propria_item_id) continue
      const s = ofertasPorPedido.get(i.cotacao_propria_item_id) ?? new Set<string>()
      s.add(o.id)
      ofertasPorPedido.set(i.cotacao_propria_item_id, s)
    }
    const f = o.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
    return {
      id: o.id,
      fornecedor: f?.nome_fantasia ?? f?.razao_social ?? '—',
      numero: o.numero_orcamento,
      data: o.data_cotacao,
      total: o.total_documento,
      itens: itensOrc.length,
      produtos: new Set(itensOrc.flatMap((i) => (i.cotacao_propria_item_id ? [i.cotacao_propria_item_id] : []))).size,
      conferir: itensOrc.filter((i) => i.vinculo_origem === 'ia').length,
    }
  })

  // A importação grava cotação e insumos novos na mesma transação, então o
  // insumo criado por ela tem exatamente o mesmo created_at
  const criadoEm = new Date(cotacao.created_at).getTime()
  const produtos: ProdutoPedido[] = itens.map(({ insumos, ...p }) => ({
    ...p,
    novo_no_cadastro: !!insumos?.created_at && new Date(insumos.created_at).getTime() === criadoEm,
    ofertas: ofertasPorPedido.get(p.id)?.size ?? 0,
  }))
  const comOferta = produtos.filter((p) => p.ofertas > 0).length
  const novos = produtos.filter((p) => p.novo_no_cadastro).length

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/cotacoes-proprias', label: 'Cotações próprias' }}
        grupo="Cotação própria"
        titulo={<span className="leitura">{cotacao.numero}</span>}
        descricao={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {[cotacao.unidade, cotacao.emitida_em && `emitida em ${dataHora(cotacao.emitida_em)}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className={`selo ${cotacao.status === 'concluida' ? 'selo-ok' : ''}`}>
              {cotacao.status === 'concluida' ? 'Concluída' : 'Aberta'}
            </span>
          </span>
        }
        acoes={
          <>
            {arquivoUrl && (
              <a href={arquivoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secundario btn-sm">
                <Paperclip size={14} />
                PDF da cotação
              </a>
            )}
            <ExcluirCotacaoPropriaButton id={id} numero={cotacao.numero} action={excluirCotacaoPropria} />
            <Link href={`/cotacoes-proprias/${id}/orcamentos/novo`} className="btn btn-primario btn-sm">
              <Plus size={14} />
              Adicionar orçamento
            </Link>
          </>
        }
      />

      <p className="mb-5 text-[13px] text-ardosia">
        Importada em {dataHora(cotacao.created_at)}
        {cotacao.importada_por && <> por {cotacao.importada_por}</>}
        {novos > 0 && (
          <>
            {' · '}
            <span className="text-grafite">{novos}</span> produto(s) entraram no cadastro de insumos com ela
          </>
        )}
      </p>

      <section className="painel mb-5">
        <div className="painel-topo">
          <div>
            <h2 className="painel-titulo">Orçamentos dos fornecedores</h2>
            <p className="text-[12.5px] text-ardosia">
              {linhasOrcamento.length
                ? `${linhasOrcamento.length} orçamento(s) · ${comOferta} de ${produtos.length} produtos com pelo menos uma oferta`
                : 'Os orçamentos que os fornecedores mandarem para esta cotação entram aqui.'}
            </p>
          </div>
        </div>
        {linhasOrcamento.length === 0 ? (
          <Vazio
            embutido
            icone={FileText}
            titulo="Nenhum orçamento ainda"
            texto="Suba o PDF, a planilha ou a foto do orçamento: a IA lê os preços e liga cada item a um produto pedido."
            acao={
              <Link href={`/cotacoes-proprias/${id}/orcamentos/novo`} className="btn btn-primario btn-sm">
                Adicionar orçamento
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela tabela-compacta whitespace-nowrap">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Orçamento</th>
                  <th>Data</th>
                  <th className="num">Itens</th>
                  <th className="num">Produtos pedidos</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhasOrcamento.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/cotacoes-proprias/${id}/orcamentos/${o.id}`} className="font-medium hover:underline">
                        {o.fornecedor}
                      </Link>
                      {o.conferir > 0 && <span className="selo ml-2 h-5 px-1.5 text-[11px]">{o.conferir} a conferir</span>}
                    </td>
                    <td className="leitura text-[12.5px] text-ardosia">{o.numero ?? '—'}</td>
                    <td className="text-ardosia">{dataCurta(o.data)}</td>
                    <td className="num leitura">{o.itens}</td>
                    <td className="num leitura">{o.produtos}</td>
                    <td className="num leitura">{o.total != null ? moeda(o.total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ProdutosCotacaoPropria produtos={produtos} />
    </div>
  )
}
