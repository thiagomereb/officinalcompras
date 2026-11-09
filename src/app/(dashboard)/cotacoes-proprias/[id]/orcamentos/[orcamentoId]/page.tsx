import { notFound } from 'next/navigation'
import { ChevronDown, Paperclip, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'
import { buscarTodos } from '@/lib/supabase/consultas'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { CotacaoForm } from '@/components/cotacoes/CotacaoForm'
import { ItensOrcamento, type ItemOrcamento } from '@/components/cotacoes-proprias/ItensOrcamento'
import { atualizarCotacao } from '@/app/(dashboard)/cotacoes/actions'
import { alterarVinculoOrcamento, confirmarSugestoes, excluirOrcamento } from '../../../orcamentos-actions'
import { ExcluirOrcamentoButton } from './ExcluirOrcamentoButton'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string; orcamentoId: string }> }) {
  const { id, orcamentoId } = await params
  const supabase = await createClient()

  const [{ data: orcamento }, { data: cotacao }] = await Promise.all([
    supabase
      .from('cotacoes')
      .select('*, fornecedores(razao_social, nome_fantasia)')
      .eq('id', orcamentoId)
      .eq('cotacao_propria_id', id)
      .single(),
    supabase.from('cotacoes_proprias').select('numero').eq('id', id).single(),
  ])
  if (!orcamento || !cotacao) notFound()

  const [itensRaw, pedidos, { data: fornecedores }, arquivoUrl] = await Promise.all([
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_itens')
        .select('id, descricao_original, preco_unitario, quantidade_minima, quantidade, unidade, validade, pais_origem, ipi, st, vinculo_origem, vinculo_obs, cotacao_propria_item_id')
        .eq('cotacao_id', orcamentoId)
        .order('created_at')
        .order('id')
        .range(de, ate),
    ),
    buscarTodos((de, ate) =>
      supabase.from('cotacao_propria_itens').select('id, codigo, nome').eq('cotacao_propria_id', id).order('ordem').range(de, ate),
    ),
    supabase.from('fornecedores').select('*').order('razao_social'),
    getArquivoSignedUrl(supabase, orcamento.arquivo_url),
  ])

  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]))
  const itens: ItemOrcamento[] = itensRaw.map((i) => ({
    id: i.id,
    descricao: i.descricao_original,
    preco_unitario: i.preco_unitario,
    quantidade_minima: i.quantidade_minima,
    quantidade: i.quantidade,
    unidade: i.unidade,
    validade: i.validade,
    pais_origem: i.pais_origem,
    ipi: i.ipi,
    pedido: i.cotacao_propria_item_id ? (pedidoPorId.get(i.cotacao_propria_item_id) ?? null) : null,
    origem: i.vinculo_origem as ItemOrcamento['origem'],
    obs: i.vinculo_obs,
  }))

  // Confere se a leitura pegou todos os itens: o documento pode trazer o total com ou sem impostos
  const soma = itensRaw.reduce((s, i) => s + i.preco_unitario * (i.quantidade ?? 1), 0)
  const somaImpostos = itensRaw.reduce(
    (s, i) => s + i.preco_unitario * (i.quantidade ?? 1) * (1 + ((i.ipi ?? 0) + (i.st ?? 0)) / 100),
    0,
  )
  const total = orcamento.total_documento
  const tolerancia = total ? Math.max(0.1, total * 0.001) : 0
  const totalBate = total == null || Math.abs(soma - total) <= tolerancia || Math.abs(somaImpostos - total) <= tolerancia

  const fornecedor = orcamento.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
  const vinculados = itens.filter((i) => i.pedido).length
  const produtos = new Set(itens.flatMap((i) => (i.pedido ? [i.pedido.id] : []))).size

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: `/cotacoes-proprias/${id}`, label: `Cotação ${cotacao.numero}` }}
        grupo="Orçamento"
        titulo={fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? 'Fornecedor'}
        descricao={[
          orcamento.numero_orcamento && `nº ${orcamento.numero_orcamento}`,
          `de ${data(orcamento.data_cotacao)}`,
          orcamento.validade_texto && `válido por ${orcamento.validade_texto}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        acoes={
          <>
            {arquivoUrl && (
              <a href={arquivoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secundario btn-sm max-w-[260px]">
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{orcamento.arquivo_nome ?? 'Arquivo'}</span>
              </a>
            )}
            <ExcluirOrcamentoButton orcamentoId={orcamentoId} cotacaoPropriaId={id} action={excluirOrcamento} />
          </>
        }
      />

      <p className="mb-4 text-[13px] text-ardosia">
        {itens.length} item(ns) · {vinculados} ligado(s) a {produtos} produto(s) pedido(s)
        {total != null && (
          <>
            {' · '}total do documento <span className="leitura text-grafite">{moeda(total)}</span>
          </>
        )}
        {orcamento.pedido_minimo != null && <> · pedido mínimo {moeda(orcamento.pedido_minimo)}</>}
        {orcamento.frete_tipo && <> · frete {orcamento.frete_tipo}</>}
      </p>

      {!totalBate && (
        <p className="aviso aviso-atencao mb-4" role="status">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            A soma dos itens ({moeda(soma)}, ou {moeda(somaImpostos)} com impostos) não bate com o total do documento (
            {moeda(total!)}). Confira no arquivo se algum item ficou de fora.
          </span>
        </p>
      )}

      <details className="painel group mb-5" open={orcamento.prazo_entrega_dias == null && orcamento.prazo_pagamento_dias == null}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 select-none [&::-webkit-details-marker]:hidden">
          <span className="painel-titulo">Condições comerciais</span>
          <span className="text-[12.5px] text-ardosia">
            Entrega {orcamento.prazo_entrega_dias != null ? `${orcamento.prazo_entrega_dias} d` : '—'} · Pagamento{' '}
            {orcamento.prazo_pagamento_dias != null ? `${orcamento.prazo_pagamento_dias} d` : '—'} · Frete{' '}
            {orcamento.frete_fixo == null ? '—' : orcamento.frete_fixo > 0 ? moeda(orcamento.frete_fixo) : 'grátis'}
          </span>
          <ChevronDown size={16} className="ml-auto text-ardosia transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-linha-2 px-5 pb-6 pt-5">
          <CotacaoForm fornecedores={fornecedores ?? []} cotacao={orcamento} action={atualizarCotacao.bind(null, orcamentoId)} />
        </div>
      </details>

      <ItensOrcamento
        itens={itens}
        pedidos={pedidos}
        orcamentoId={orcamentoId}
        cotacaoPropriaId={id}
        alterar={alterarVinculoOrcamento}
        confirmar={confirmarSugestoes}
      />
    </div>
  )
}
