import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Package, ArrowUpRight, Search } from 'lucide-react'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const POR_PAGINA = 50

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>
}) {
  const { q = '', p = '1' } = await searchParams
  const pagina = Math.max(1, parseInt(p) || 1)
  const offset = (pagina - 1) * POR_PAGINA

  const supabase = await createClient()

  let query = supabase
    .from('insumos')
    .select('id, nome_padrao, cas_number, unidade_padrao, descricao, insumo_sinonimos(sinonimo)', { count: 'exact' })
    .order('nome_padrao')
    .range(offset, offset + POR_PAGINA - 1)

  // Busca também por CAS e sinônimo ("Vitamina C" acha "Ácido Ascórbico").
  // Vírgula, parênteses e aspas têm significado na sintaxe do filtro .or() do
  // PostgREST, então saem do termo.
  const termo = q.trim().replace(/[,()"\\%]/g, ' ').trim()
  if (termo) {
    const { data: porSinonimo } = await supabase
      .from('insumo_sinonimos')
      .select('insumo_id')
      .ilike('sinonimo', `%${termo}%`)
      .limit(200)
    const ids = [...new Set((porSinonimo ?? []).map((s) => s.insumo_id))]
    const filtros = [`nome_padrao.ilike.%${termo}%`, `cas_number.ilike.%${termo}%`]
    if (ids.length) filtros.push(`id.in.(${ids.join(',')})`)
    query = query.or(filtros.join(','))
  }

  const { data: insumos, count } = await query

  const total = count ?? 0
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  const url = (page: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('p', String(page))
    return `/insumos?${params}`
  }

  // Janela de até 5 páginas centrada na atual
  const inicioJanela = Math.max(1, Math.min(pagina - 2, totalPaginas - 4))
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, k) => inicioJanela + k)

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Cadastros"
        titulo="Insumos"
        descricao={`${total.toLocaleString('pt-BR')} ${q ? 'encontrado(s)' : 'cadastrado(s)'}`}
        acoes={
          <Link href="/insumos/novo" className="btn btn-primario">
            <Plus size={16} />
            Novo insumo
          </Link>
        }
      />

      <form method="GET" className="mb-4" role="search">
        <div className="relative w-full sm:w-96">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, sinônimo ou CAS"
            aria-label="Buscar insumos"
            className="campo pl-8"
          />
        </div>
      </form>

      {!insumos?.length ? (
        <Vazio
          icone={Package}
          titulo={q ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
          texto={
            q
              ? `Nada corresponde a “${q}” no nome, nos sinônimos ou no CAS.`
              : 'Cadastre os insumos que a farmácia compra. Os itens das cotações são vinculados a eles.'
          }
          acao={
            !q && (
              <Link href="/insumos/novo" className="btn btn-primario btn-sm">
                Novo insumo
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="painel overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome padrão</th>
                  <th>CAS</th>
                  <th>Un.</th>
                  <th>Sinônimos</th>
                  <th>
                    <span className="sr-only">Editar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((insumo) => {
                  const syns = (insumo.insumo_sinonimos as { sinonimo: string }[]) ?? []
                  return (
                    <tr key={insumo.id}>
                      <td className="min-w-[220px]">
                        <Link href={`/insumos/${insumo.id}`} className="font-medium hover:underline">
                          {insumo.nome_padrao}
                        </Link>
                        {insumo.descricao && (
                          <p className="line-clamp-1 text-[12px] text-ardosia">{insumo.descricao}</p>
                        )}
                      </td>
                      <td className="leitura whitespace-nowrap text-[12.5px] text-ardosia">
                        {insumo.cas_number ?? '—'}
                      </td>
                      <td className="text-ardosia">{insumo.unidade_padrao}</td>
                      <td className="max-w-md text-[12.5px] text-ardosia">
                        {syns.length > 0 ? (
                          <span className="line-clamp-2">
                            {syns.slice(0, 4).map((s) => s.sinonimo).join(' · ')}
                            {syns.length > 4 && <span className="text-ardosia-2"> · +{syns.length - 4}</span>}
                          </span>
                        ) : (
                          <span className="text-ardosia-2">—</span>
                        )}
                      </td>
                      <td className="w-10">
                        <Link
                          href={`/insumos/${insumo.id}`}
                          className="btn btn-fantasma btn-icone btn-sm"
                          aria-label={`Editar ${insumo.nome_padrao}`}
                          title="Editar"
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Paginação">
              <span className="text-[13px] text-ardosia">
                <span className="num">{offset + 1}–{Math.min(offset + POR_PAGINA, total)}</span> de{' '}
                <span className="num">{total.toLocaleString('pt-BR')}</span>
              </span>
              <div className="flex items-center gap-1">
                {pagina > 1 && (
                  <Link href={url(pagina - 1)} className="btn btn-secundario btn-sm">
                    Anterior
                  </Link>
                )}
                {paginas.map((pg) => (
                  <Link
                    key={pg}
                    href={url(pg)}
                    aria-current={pg === pagina ? 'page' : undefined}
                    className={`btn btn-sm num min-w-[30px] ${pg === pagina ? 'btn-primario' : 'btn-fantasma'}`}
                  >
                    {pg}
                  </Link>
                ))}
                {pagina < totalPaginas && (
                  <Link href={url(pagina + 1)} className="btn btn-secundario btn-sm">
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
