import { notFound } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'
import { buscarTodos } from '@/lib/supabase/consultas'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { ProdutosCotacaoPropria, type ProdutoPedido } from '@/components/cotacoes-proprias/ProdutosCotacaoPropria'
import { ExcluirCotacaoPropriaButton } from './ExcluirCotacaoPropriaButton'
import { excluirCotacaoPropria } from '../actions'

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export default async function CotacaoPropriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cotacao } = await supabase.from('cotacoes_proprias').select('*').eq('id', id).single()
  if (!cotacao) notFound()

  const [itens, arquivoUrl] = await Promise.all([
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_propria_itens')
        .select('id, codigo, ean, nome, teor, quantidade, unidade, insumo_id, insumos(created_at)')
        .eq('cotacao_propria_id', id)
        .order('ordem')
        .range(de, ate),
    ),
    getArquivoSignedUrl(supabase, cotacao.arquivo_url),
  ])

  // A importação grava cotação e insumos novos na mesma transação, então o
  // insumo criado por ela tem exatamente o mesmo created_at
  const criadoEm = new Date(cotacao.created_at).getTime()
  const produtos: ProdutoPedido[] = itens.map(({ insumos, ...p }) => ({
    ...p,
    novo_no_cadastro: !!insumos?.created_at && new Date(insumos.created_at).getTime() === criadoEm,
  }))
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

      <ProdutosCotacaoPropria produtos={produtos} />
    </div>
  )
}
