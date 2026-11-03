import Link from 'next/link'
import { History, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { buscarTodos } from '@/lib/supabase/consultas'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import { Indicadores } from '@/components/dashboard/Indicadores'

const POR_PAGINA = 50
const FUSO = 'America/Sao_Paulo'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO })
const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

export default async function HistoricoComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; p?: string }>
}) {
  const { q = '', de = '', ate = '', p = '1' } = await searchParams
  const pagina = Math.max(1, parseInt(p) || 1)
  const supabase = await createClient()

  // Vírgula, parênteses e aspas têm significado na sintaxe do .or() do PostgREST
  const termo = q.replace(/[,()"\\%]/g, ' ').trim()

  const compras = await buscarTodos((inicio, fim) => {
    let consulta = supabase
      .from('historico_compras')
      .select('*')
      .order('aprovado_em', { ascending: false })
      .order('id')
      .range(inicio, fim)
    if (termo) consulta = consulta.or(`insumo_nome.ilike.%${termo}%,fornecedor_nome.ilike.%${termo}%`)
    // Datas do filtro são dias de Brasília
    if (ehData(de)) consulta = consulta.gte('aprovado_em', `${de}T00:00:00-03:00`)
    if (ehData(ate)) consulta = consulta.lte('aprovado_em', `${ate}T23:59:59.999-03:00`)
    return consulta
  })

  const valorTotal = compras.reduce((soma, c) => soma + (c.valor_total ?? 0), 0)
  const fornecedores = new Set(compras.map((c) => c.fornecedor_nome).filter(Boolean)).size
  const comSugestao = compras.filter((c) => c.sugerido != null)
  const seguiram = comSugestao.filter((c) => c.sugerido).length

  const totalPaginas = Math.max(1, Math.ceil(compras.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = compras.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)
  const filtrando = Boolean(termo || de || ate)

  const url = (pg: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (de) params.set('de', de)
    if (ate) params.set('ate', ate)
    params.set('p', String(pg))
    return `/compras?${params}`
  }

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Compras"
        titulo="Histórico de compras"
        descricao="O que foi aprovado nos mapas de cotação, com o preço e a quantidade da aprovação."
      />

      <form method="GET" className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <div className="w-full sm:w-80">
          <label htmlFor="h-q" className="legenda">Insumo ou fornecedor</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
            <input id="h-q" name="q" defaultValue={q} className="campo pl-8" placeholder="Ácido ascórbico, Galena…" />
          </div>
        </div>
        <div>
          <label htmlFor="h-de" className="legenda">De</label>
          <input id="h-de" type="date" name="de" defaultValue={de} className="campo" />
        </div>
        <div>
          <label htmlFor="h-ate" className="legenda">Até</label>
          <input id="h-ate" type="date" name="ate" defaultValue={ate} className="campo" />
        </div>
        <button type="submit" className="btn btn-secundario">
          Filtrar
        </button>
        {filtrando && (
          <Link href="/compras" className="btn btn-fantasma">
            Limpar
          </Link>
        )}
      </form>

      {compras.length === 0 ? (
        <Vazio
          icone={History}
          titulo={filtrando ? 'Nenhuma compra encontrada' : 'Nenhuma compra aprovada ainda'}
          texto={
            filtrando
              ? 'Nada aprovado corresponde ao filtro.'
              : 'Quando um mapa de cotação é aprovado, cada insumo escolhido aparece aqui com fornecedor, preço e quantidade.'
          }
          acao={
            !filtrando && (
              <Link href="/mapas" className="btn btn-secundario btn-sm">
                Ver mapas de cotação
              </Link>
            )
          }
        />
      ) : (
        <>
          <Indicadores
            itens={[
              { rotulo: 'Valor aprovado', valor: moeda(valorTotal), detalhe: filtrando ? 'no filtro atual' : 'em todo o histórico' },
              { rotulo: 'Itens comprados', valor: compras.length.toLocaleString('pt-BR'), detalhe: `${new Set(compras.map((c) => c.mapa_id)).size} mapa(s)` },
              { rotulo: 'Fornecedores', valor: String(fornecedores), detalhe: 'com compra aprovada' },
              {
                rotulo: 'Seguiram a sugestão',
                valor: comSugestao.length ? `${Math.round((seguiram / comSugestao.length) * 100)}%` : '—',
                detalhe: comSugestao.length ? `${seguiram} de ${comSugestao.length} com mais de uma oferta` : 'sem comparação registrada',
              },
            ]}
          />

          <div className="painel overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Insumo</th>
                  <th>Fornecedor</th>
                  <th className="num">Quantidade</th>
                  <th className="num">Preço</th>
                  <th className="num">Valor</th>
                  <th>Decisão</th>
                  <th>Mapa</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id}>
                    <td className="num whitespace-nowrap text-ardosia">{c.aprovado_em ? dataBR(c.aprovado_em) : '—'}</td>
                    <td className="min-w-[180px]">
                      {c.insumo_id ? (
                        <Link href={`/insumos/${c.insumo_id}`} className="font-medium hover:underline">
                          {c.insumo_nome ?? '—'}
                        </Link>
                      ) : (
                        c.insumo_nome ?? '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap">{c.fornecedor_nome ?? '—'}</td>
                    <td className="num leitura whitespace-nowrap">
                      {c.quantidade != null ? `${c.quantidade.toLocaleString('pt-BR')} ${c.quantidade_unidade ?? ''}` : '—'}
                    </td>
                    <td className="num">
                      {c.preco_base != null ? <LeituraPreco valor={c.preco_base} base={c.unidade_base} /> : '—'}
                    </td>
                    <td className="num leitura whitespace-nowrap font-medium">
                      {c.valor_total != null ? moeda(c.valor_total) : <span className="font-normal text-ardosia-2">—</span>}
                    </td>
                    <td className="max-w-[260px] text-[12.5px]">
                      {c.sugerido === true ? (
                        <span className="text-ardosia">seguiu a sugestão</span>
                      ) : c.sugerido === false ? (
                        <span className="font-medium">outra oferta</span>
                      ) : (
                        <span className="text-ardosia-2">oferta única</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {c.mapa_id && (
                        <Link href={`/mapas/${c.mapa_id}`} className="text-[12.5px] text-ardosia hover:text-grafite hover:underline">
                          {c.mapa_titulo ?? 'abrir'}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Paginação">
              <span className="text-[13px] text-ardosia">
                Página <span className="num">{paginaAtual}</span> de <span className="num">{totalPaginas}</span>
              </span>
              <div className="flex gap-1">
                {paginaAtual > 1 && (
                  <Link href={url(paginaAtual - 1)} className="btn btn-secundario btn-sm">
                    Anterior
                  </Link>
                )}
                {paginaAtual < totalPaginas && (
                  <Link href={url(paginaAtual + 1)} className="btn btn-secundario btn-sm">
                    Próxima
                  </Link>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
