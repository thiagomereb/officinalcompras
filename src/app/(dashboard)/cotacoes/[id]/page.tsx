import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Paperclip, AlertTriangle, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'
import { buscarTodos } from '@/lib/supabase/consultas'
import { precoPorUnidadeBase } from '@/lib/unidades'
import type { Tables } from '@/types/database'
import { CotacaoForm } from '@/components/cotacoes/CotacaoForm'
import { AdicionarItemForm } from '@/components/cotacoes/AdicionarItemForm'
import { RemoverItemButton } from '@/components/cotacoes/RemoverItemButton'
import { atualizarCotacao, adicionarItem, removerItem, excluirCotacao, removerTodosItens, vincularItensAutomatico, vincularItemManualmente } from '../actions'
import { VincularManualmente } from '@/components/cotacoes/VincularManualmente'
import { ExcluirCotacaoButton } from './ExcluirCotacaoButton'
import { OcrButton } from '@/components/cotacoes/OcrButton'
import { LimparItensButton } from '@/components/cotacoes/LimparItensButton'
import { VincularItensButton } from '@/components/cotacoes/VincularItensButton'

type Cotacao = Tables<'cotacoes'>

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function diasAteVencer(validade: string | null, hoje: Date) {
  if (!validade) return null
  // "YYYY-MM-DD" sozinho é lido como meia-noite UTC; com horário vira data local
  return Math.round((new Date(validade + 'T00:00:00').getTime() - hoje.getTime()) / 86400000)
}

export default async function CotacaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { id } = await params
  const { aba } = await searchParams
  const supabase = await createClient()

  const [cotacaoRes, fornecedoresRes, itens, insumos] = await Promise.all([
    supabase.from('cotacoes').select('*, fornecedores(razao_social, nome_fantasia)').eq('id', id).single(),
    supabase.from('fornecedores').select('*').order('razao_social'),
    buscarTodos((de, ate) =>
      supabase
        .from('cotacao_itens')
        .select('*, insumos(nome_padrao)')
        .eq('cotacao_id', id)
        .order('created_at')
        .order('id')
        .range(de, ate),
    ),
    buscarTodos((de, ate) =>
      supabase.from('insumos').select('id, nome_padrao').order('nome_padrao').order('id').range(de, ate),
    ),
  ])

  const cotacao = cotacaoRes.data as Cotacao | null
  if (!cotacao) notFound()

  const fornecedor = (cotacaoRes.data as { fornecedores: { razao_social: string; nome_fantasia: string | null } | null }).fornecedores
  // Fornecedor inativo some da lista de novas cotações, mas continua
  // selecionável na cotação que já é dele
  const fornecedores = (fornecedoresRes.data ?? []).filter((f) => f.ativo || f.id === cotacao.fornecedor_id)

  const updateAction = atualizarCotacao.bind(null, id)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diasValidade = diasAteVencer(cotacao.validade_cotacao, hoje)
  const semVinculo = itens.filter((i) => !i.insumo_id).length
  const arquivoSignedUrl = await getArquivoSignedUrl(supabase, cotacao.arquivo_url)

  // Busca sinônimos para detectar duplicatas entre insumos distintos (ex: "Cafeína" e "Cafeína anidra")
  const insumoIdsLinked = [...new Set(itens.filter(i => i.insumo_id).map(i => i.insumo_id!))]
  const { data: sinonimosData } = insumoIdsLinked.length > 0
    ? await supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', insumoIdsLinked)
    : { data: [] as { insumo_id: string; sinonimo: string }[] }

  // sinonimo_text → insumo_id dono do sinônimo
  const sinonimoPorTexto = new Map<string, string>()
  for (const s of sinonimosData ?? []) {
    sinonimoPorTexto.set(s.sinonimo.trim().toLowerCase(), s.insumo_id)
  }

  // Se o nome_padrao de um insumo aparece como sinônimo de outro, unifica no canônico
  const insumoNomePorId = new Map(insumos.map(i => [i.id, i.nome_padrao]))
  const canonicalId = new Map<string, string>()
  for (const id of insumoIdsLinked) {
    const nome = insumoNomePorId.get(id)?.trim().toLowerCase()
    const dono = nome ? sinonimoPorTexto.get(nome) : undefined
    canonicalId.set(id, dono && dono !== id ? dono : id)
  }

  // Preço por unidade base (R$/g, R$/mL...) para comparar embalagens diferentes
  const precoPorUnidade = (item: typeof itens[0]) =>
    precoPorUnidadeBase(item.preco_unitario, item.quantidade_minima, item.unidade).valor

  // Chave de agrupamento: insumo canônico (resolve sinônimos) ou descrição normalizada
  const chaveComparacao = (item: typeof itens[0]) =>
    item.insumo_id ? (canonicalId.get(item.insumo_id) ?? item.insumo_id) : item.descricao_original.trim().toLowerCase()

  const gruposPorChave = new Map<string, typeof itens>()
  for (const item of itens) {
    const chave = chaveComparacao(item)
    const grupo = gruposPorChave.get(chave) ?? []
    grupo.push(item)
    gruposPorChave.set(chave, grupo)
  }

  // Para cada grupo com mais de 1 item, identifica o id mais barato
  const maisBaratoId = new Set<string>()
  const temDuplicata = new Set<string>()
  for (const grupo of gruposPorChave.values()) {
    if (grupo.length < 2) continue
    const melhor = grupo.reduce((a, b) => precoPorUnidade(a) <= precoPorUnidade(b) ? a : b)
    maisBaratoId.add(melhor.id)
    for (const item of grupo) temDuplicata.add(item.id)
  }

  return (
    <div className="p-8 space-y-8">
      {/* Cabeçalho */}
      <div>
        <Link
          href="/cotacoes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft size={16} />
          Voltar para cotações
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? 'Cotação'}
            </h2>
            <p className="text-gray-500 mt-1">Data: {formatDate(cotacao.data_cotacao)}</p>
          </div>
          <div className="flex items-center gap-3">
            {arquivoSignedUrl && (
              <a
                href={arquivoSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Paperclip size={14} />
                {cotacao.arquivo_nome ?? 'Arquivo'}
              </a>
            )}
            <ExcluirCotacaoButton id={id} action={excluirCotacao} />
          </div>
        </div>

        {/* Condições comerciais entram no score do mapa (entrega, pagamento, frete) */}
        <details
          className="mt-4 bg-white rounded-xl border border-gray-200"
          open={cotacao.prazo_entrega_dias == null && cotacao.prazo_pagamento_dias == null}
        >
          <summary className="flex flex-wrap items-center gap-2 px-5 py-3 cursor-pointer text-sm font-medium text-gray-700 select-none">
            <SlidersHorizontal size={15} className="text-gray-400" />
            Condições comerciais
            <span className="text-xs font-normal text-gray-400">
              Entrega: {cotacao.prazo_entrega_dias != null ? `${cotacao.prazo_entrega_dias}d` : '—'}
              {' · '}Pgto: {cotacao.prazo_pagamento_dias != null ? `${cotacao.prazo_pagamento_dias}d` : '—'}
              {' · '}Frete: {cotacao.frete_fixo ? `R$ ${cotacao.frete_fixo.toFixed(2)}` : 'grátis'}
            </span>
          </summary>
          <div className="px-5 pb-5 pt-4 border-t border-gray-100">
            <CotacaoForm fornecedores={fornecedores} cotacao={cotacao} action={updateAction} />
          </div>
        </details>

        {diasValidade !== null && diasValidade <= 7 && (
          <div className={`mt-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${diasValidade < 0 ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
            <AlertTriangle size={15} />
            {diasValidade < 0
              ? `Cotação vencida há ${Math.abs(diasValidade)} dia(s).`
              : `Cotação vence em ${diasValidade} dia(s) (${formatDate(cotacao.validade_cotacao)}).`}
          </div>
        )}
      </div>

      {/* Itens */}
      <div>
        {/* Cabeçalho + abas */}
        <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Itens <span className="text-gray-400 font-normal">({itens.length})</span>
            </h3>
            {itens.length > 0 && (
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                <Link
                  href={`/cotacoes/${id}`}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    aba !== 'vincular'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Todos os itens
                </Link>
                <Link
                  href={`/cotacoes/${id}?aba=vincular`}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    aba === 'vincular'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Não vinculados
                  {semVinculo > 0 && (
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                      aba === 'vincular' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {semVinculo}
                    </span>
                  )}
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <VincularItensButton cotacaoId={id} semVinculo={semVinculo} action={vincularItensAutomatico} />
            <LimparItensButton cotacaoId={id} totalItens={itens.length} action={removerTodosItens} />
            <OcrButton cotacaoId={id} temArquivo={!!cotacao.arquivo_url} totalItens={itens.length} />
            <AdicionarItemForm cotacaoId={id} insumos={insumos} action={adicionarItem} />
          </div>
        </div>

        {aba === 'vincular' ? (
          semVinculo === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-400 text-sm">Todos os itens já estão vinculados.</p>
            </div>
          ) : (
            <VincularManualmente
              itens={itens
                .filter(i => !i.insumo_id)
                .map(i => ({
                  id: i.id,
                  descricao_original: i.descricao_original,
                  preco_unitario: i.preco_unitario,
                  unidade: i.unidade ?? null,
                  quantidade_minima: i.quantidade_minima ?? null,
                }))}
              insumos={insumos}
              cotacaoId={id}
              action={vincularItemManualmente}
            />
          )
        ) : itens.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-400 text-sm">Nenhum item lançado ainda.</p>
            <p className="text-gray-300 text-xs mt-1">Clique em &ldquo;Adicionar item&rdquo; para começar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Insumo</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Qtd.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">UN</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Preço Unit.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Valor Total</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">IPI%</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">ST%</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Total c/ Impostos</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">CAS</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Origem</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Validade</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((item) => {
                  const insumo = item.insumos as { nome_padrao: string } | null
                  const diasItem = diasAteVencer(item.validade, hoje)
                  const vencendo = diasItem !== null && diasItem <= 90
                  const qtd = item.quantidade ?? 1
                  const valorTotal = qtd * item.preco_unitario
                  const ipi = item.ipi ?? 0
                  const st = item.st ?? 0
                  const valorComImpostos = valorTotal * (1 + ipi / 100 + st / 100)
                  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  const eDuplicata = temDuplicata.has(item.id)
                  const eMaisBarato = maisBaratoId.has(item.id)

                  // Calcula % mais caro em relação ao mais barato do grupo
                  let pctMaisCaro: number | null = null
                  if (eDuplicata && !eMaisBarato) {
                    const chave = chaveComparacao(item)
                    const grupo = gruposPorChave.get(chave)!
                    const melhor = grupo.reduce((a, b) => precoPorUnidade(a) <= precoPorUnidade(b) ? a : b)
                    const diff = precoPorUnidade(item) / precoPorUnidade(melhor) - 1
                    if (diff > 0) pctMaisCaro = diff * 100
                  }

                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${vencendo ? 'bg-yellow-50/50' : eMaisBarato ? 'bg-green-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px]">
                        <div className="truncate">{item.descricao_original}</div>
                        {eMaisBarato && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            ✓ Mais barato
                          </span>
                        )}
                        {eDuplicata && !eMaisBarato && pctMaisCaro !== null && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            +{pctMaisCaro.toFixed(0)}% mais caro
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {insumo
                          ? <span className="text-blue-600 text-xs font-medium">{insumo.nome_padrao}</span>
                          : <span className="text-gray-300 text-xs">Não vinculado</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{item.quantidade_minima ?? item.quantidade ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{item.unidade ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{fmt(item.preco_unitario)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">{fmt(valorTotal)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{ipi > 0 ? `${ipi}%` : '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{st > 0 ? `${st}%` : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{fmt(valorComImpostos)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{item.cas ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{item.pais_origem ?? '—'}</td>
                      <td className="px-4 py-3">
                        {item.validade
                          ? <span className={`text-xs ${vencendo ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>{formatDate(item.validade)}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <RemoverItemButton id={item.id} cotacaoId={id} action={removerItem} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
