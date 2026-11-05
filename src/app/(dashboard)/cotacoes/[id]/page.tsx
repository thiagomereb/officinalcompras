import { notFound } from 'next/navigation'
import { Paperclip, AlertTriangle, ChevronDown, FileText, FileDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArquivoSignedUrl } from '@/lib/supabase/storage'
import { buscarTodos } from '@/lib/supabase/consultas'
import { precoPorUnidadeBase } from '@/lib/unidades'
import type { Tables } from '@/types/database'
import { CotacaoForm } from '@/components/cotacoes/CotacaoForm'
import { AdicionarItemForm } from '@/components/cotacoes/AdicionarItemForm'
import { RemoverItemButton } from '@/components/cotacoes/RemoverItemButton'
import { atualizarCotacao, adicionarItem, removerItem, excluirCotacao, removerTodosItens, vincularItensAutomatico, vincularItemManualmente, alterarVinculo } from '../actions'
import { EditarVinculo } from '@/components/cotacoes/EditarVinculo'
import { VincularManualmente } from '@/components/cotacoes/VincularManualmente'
import { ExcluirCotacaoButton } from './ExcluirCotacaoButton'
import { OcrButton } from '@/components/cotacoes/OcrButton'
import { LimparItensButton } from '@/components/cotacoes/LimparItensButton'
import { VincularItensButton } from '@/components/cotacoes/VincularItensButton'
import { AbasItens } from '@/components/cotacoes/AbasItens'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

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

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function CotacaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { id } = await params
  const { aba } = await searchParams
  const supabase = await createClient()

  const [cotacaoRes, fornecedoresRes, itens] = await Promise.all([
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
  ])

  const cotacao = cotacaoRes.data as Cotacao | null
  if (!cotacao) notFound()

  const fornecedor = (cotacaoRes.data as { fornecedores: { razao_social: string; nome_fantasia: string | null } | null }).fornecedores
  const nomeFornecedor = fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? 'Cotação'
  // Fornecedor inativo some da lista de novas cotações, mas continua
  // selecionável na cotação que já é dele
  const fornecedores = (fornecedoresRes.data ?? []).filter((f) => f.ativo || f.id === cotacao.fornecedor_id)

  const updateAction = atualizarCotacao.bind(null, id)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const diasValidade = diasAteVencer(cotacao.validade_cotacao, hoje)
  const semVinculo = itens.filter((i) => !i.insumo_id).length

  // Sinônimos (para detectar duplicatas entre insumos distintos, ex: "Cafeína" e
  // "Cafeína anidra") e o link do arquivo não dependem um do outro: em paralelo
  const insumoIdsLinked = [...new Set(itens.filter(i => i.insumo_id).map(i => i.insumo_id!))]
  const [{ data: sinonimosData }, arquivoSignedUrl] = await Promise.all([
    insumoIdsLinked.length > 0
      ? supabase.from('insumo_sinonimos').select('insumo_id, sinonimo').in('insumo_id', insumoIdsLinked)
      : Promise.resolve({ data: [] as { insumo_id: string; sinonimo: string }[] }),
    getArquivoSignedUrl(supabase, cotacao.arquivo_url),
  ])

  // sinonimo_text → insumo_id dono do sinônimo
  const sinonimoPorTexto = new Map<string, string>()
  for (const s of sinonimosData ?? []) {
    sinonimoPorTexto.set(s.sinonimo.trim().toLowerCase(), s.insumo_id)
  }

  // Se o nome_padrao de um insumo aparece como sinônimo de outro, unifica no canônico
  const insumoNomePorId = new Map(
    itens.flatMap((i) => (i.insumo_id && i.insumos ? [[i.insumo_id, (i.insumos as { nome_padrao: string }).nome_padrao]] : [])),
  )
  const canonicalId = new Map<string, string>()
  for (const insumoId of insumoIdsLinked) {
    const nome = insumoNomePorId.get(insumoId)?.trim().toLowerCase()
    const dono = nome ? sinonimoPorTexto.get(nome) : undefined
    canonicalId.set(insumoId, dono && dono !== insumoId ? dono : insumoId)
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

  // Para cada grupo com mais de 1 item, identifica o mais barato e quanto os
  // outros custam a mais
  const maisBaratoId = new Set<string>()
  const pctMaisCaro = new Map<string, number>()
  for (const grupo of gruposPorChave.values()) {
    if (grupo.length < 2) continue
    const melhor = grupo.reduce((a, b) => precoPorUnidade(a) <= precoPorUnidade(b) ? a : b)
    maisBaratoId.add(melhor.id)
    for (const item of grupo) {
      const diff = precoPorUnidade(item) / precoPorUnidade(melhor) - 1
      if (item.id !== melhor.id && diff > 0) pctMaisCaro.set(item.id, diff * 100)
    }
  }

  const listaTodos =
    itens.length === 0 ? (
      <Vazio
        embutido
        icone={FileText}
        titulo="Nenhum item ainda"
        texto={
          cotacao.arquivo_url
            ? 'Use “Extrair com IA” para ler a tabela anexada, ou adicione os itens à mão.'
            : 'Anexe a tabela do fornecedor com “Extrair com IA”, ou adicione os itens à mão.'
        }
      />
    ) : (
      <div className="overflow-x-auto">
        <table className="tabela tabela-compacta whitespace-nowrap">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Insumo</th>
              <th className="num">Emb.</th>
              <th>Un.</th>
              <th className="num">Preço unit.</th>
              <th className="num">Total</th>
              <th className="num">IPI</th>
              <th className="num">ST</th>
              <th className="num">Total c/ impostos</th>
              <th>CAS</th>
              <th>Origem</th>
              <th>Validade</th>
              <th>
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const insumo = item.insumos as { nome_padrao: string } | null
              const diasItem = diasAteVencer(item.validade, hoje)
              const vencendo = diasItem !== null && diasItem <= 90
              const qtd = item.quantidade ?? 1
              const valorTotal = qtd * item.preco_unitario
              const ipi = item.ipi ?? 0
              const st = item.st ?? 0
              const valorComImpostos = valorTotal * (1 + ipi / 100 + st / 100)
              const eMaisBarato = maisBaratoId.has(item.id)
              const maisCaro = pctMaisCaro.get(item.id)

              return (
                <tr key={item.id} className="group/linha">
                  <td className="max-w-[240px]">
                    <div className="truncate" title={item.descricao_original}>{item.descricao_original}</div>
                    {eMaisBarato && <span className="selo mt-1">menor preço entre as duplicatas</span>}
                    {maisCaro != null && (
                      <span className="selo selo-alerta mt-1">+{maisCaro.toFixed(0)}% que a duplicata</span>
                    )}
                  </td>
                  <td>
                    <EditarVinculo
                      itemId={item.id}
                      cotacaoId={id}
                      insumoNome={insumo?.nome_padrao ?? null}
                      action={alterarVinculo}
                    />
                  </td>
                  <td className="num">{item.quantidade_minima ?? item.quantidade ?? '—'}</td>
                  <td className="text-ardosia">{item.unidade ?? '—'}</td>
                  <td className="num leitura">{moeda(item.preco_unitario)}</td>
                  <td className="num leitura text-ardosia">{moeda(valorTotal)}</td>
                  <td className="num text-ardosia">{ipi > 0 ? `${ipi}%` : '—'}</td>
                  <td className="num text-ardosia">{st > 0 ? `${st}%` : '—'}</td>
                  <td className="num leitura font-medium">{moeda(valorComImpostos)}</td>
                  <td className="leitura text-[12px] text-ardosia">{item.cas ?? '—'}</td>
                  <td className="text-[12.5px] text-ardosia">{item.pais_origem ?? '—'}</td>
                  <td className={vencendo ? 'font-medium text-oxido' : 'text-ardosia'}>
                    {formatDate(item.validade)}
                  </td>
                  <td>
                    <RemoverItemButton id={item.id} cotacaoId={id} action={removerItem} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )

  const listaVincular =
    semVinculo === 0 ? (
      <Vazio embutido titulo="Todos os itens estão vinculados" texto="Cada item já aponta para um insumo da tabela mestre." />
    ) : (
      <VincularManualmente
        itens={itens
          .filter((i) => !i.insumo_id)
          .map((i) => ({
            id: i.id,
            descricao_original: i.descricao_original,
            preco_unitario: i.preco_unitario,
            unidade: i.unidade ?? null,
            quantidade_minima: i.quantidade_minima ?? null,
          }))}
        cotacaoId={id}
        action={vincularItemManualmente}
      />
    )

  const condicoes = [
    `Entrega ${cotacao.prazo_entrega_dias != null ? `${cotacao.prazo_entrega_dias} d` : '—'}`,
    `Pagamento ${cotacao.prazo_pagamento_dias != null ? `${cotacao.prazo_pagamento_dias} d` : '—'}`,
    `Frete ${cotacao.frete_fixo == null ? '—' : cotacao.frete_fixo > 0 ? moeda(cotacao.frete_fixo) : 'grátis'}`,
  ].join(' · ')

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/cotacoes', label: 'Cotações' }}
        grupo="Cotação"
        titulo={nomeFornecedor}
        descricao={
          <>
            Recebida em {formatDate(cotacao.data_cotacao)}
            {cotacao.validade_cotacao && <> · válida até {formatDate(cotacao.validade_cotacao)}</>}
          </>
        }
        acoes={
          <>
            {arquivoSignedUrl && (
              <a
                href={arquivoSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secundario btn-sm max-w-[260px]"
                title={cotacao.arquivo_nome ?? 'Arquivo'}
              >
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{cotacao.arquivo_nome ?? 'Arquivo'}</span>
              </a>
            )}
            <a href={`/cotacoes/${id}/pdf`} download className="btn btn-secundario btn-sm">
              <FileDown size={14} />
              Baixar PDF
            </a>
            <ExcluirCotacaoButton id={id} action={excluirCotacao} />
          </>
        }
      />

      {diasValidade !== null && diasValidade <= 7 && (
        <p className={`aviso mb-5 ${diasValidade < 0 ? 'aviso-erro' : 'aviso-atencao'}`} role="status">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {diasValidade < 0
            ? `Cotação vencida há ${Math.abs(diasValidade)} dia(s). Os preços dela não entram mais no painel.`
            : `Cotação vence em ${diasValidade} dia(s), em ${formatDate(cotacao.validade_cotacao)}.`}
        </p>
      )}

      {/* Condições comerciais aparecem ao lado de cada oferta no mapa (entrega, pagamento, frete) */}
      <details
        className="painel group mb-6"
        open={cotacao.prazo_entrega_dias == null && cotacao.prazo_pagamento_dias == null}
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 select-none [&::-webkit-details-marker]:hidden">
          <span className="painel-titulo">Condições comerciais</span>
          <span className="text-[12.5px] text-ardosia">{condicoes}</span>
          <ChevronDown size={16} className="ml-auto text-ardosia transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-linha-2 px-5 pb-6 pt-5">
          <CotacaoForm fornecedores={fornecedores} cotacao={cotacao} action={updateAction} />
        </div>
      </details>

      <AbasItens
        inicial={aba === 'vincular' ? 'vincular' : 'todos'}
        totalItens={itens.length}
        semVinculo={semVinculo}
        todos={listaTodos}
        vincular={listaVincular}
        acoes={
          <>
            <VincularItensButton cotacaoId={id} semVinculo={semVinculo} action={vincularItensAutomatico} />
            <LimparItensButton cotacaoId={id} totalItens={itens.length} action={removerTodosItens} />
            <AdicionarItemForm cotacaoId={id} action={adicionarItem} />
            <OcrButton cotacaoId={id} temArquivo={!!cotacao.arquivo_url} totalItens={itens.length} />
          </>
        }
      />
    </div>
  )
}
