import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Plus, Package, Pencil, Tag, Search } from 'lucide-react'

const POR_PAGINA = 50

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>
}) {
  const { q = '', p = '1' } = await searchParams
  const pagina = Math.max(1, parseInt(p) || 1)
  const offset = (pagina - 1) * POR_PAGINA

  const supabase = createServiceClient()

  let query = supabase
    .from('insumos')
    .select('id, nome_padrao, cas_number, unidade_padrao, descricao, insumo_sinonimos(sinonimo)', { count: 'exact' })
    .order('nome_padrao')
    .range(offset, offset + POR_PAGINA - 1)

  if (q.trim()) {
    query = query.ilike('nome_padrao', `%${q.trim()}%`)
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

  return (
    <div className="p-8">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Insumos</h2>
          <p className="text-gray-500 mt-1">{total.toLocaleString('pt-BR')} insumo(s) cadastrado(s)</p>
        </div>
        <Link
          href="/insumos/novo"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Novo insumo
        </Link>
      </div>

      {/* Busca */}
      <form method="GET" className="mb-4">
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>

      {!insumos?.length ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Package size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">
            {q ? `Nenhum resultado para "${q}"` : 'Nenhum insumo cadastrado'}
          </p>
          {!q && <p className="text-gray-400 text-sm mt-1">Clique em "Novo insumo" para começar</p>}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Nome Padrão</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">CAS</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">UN</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sinônimos</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {insumos.map((insumo) => {
                  const syns = (insumo.insumo_sinonimos as { sinonimo: string }[]) ?? []
                  return (
                    <tr key={insumo.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">{insumo.nome_padrao}</p>
                        {insumo.descricao && (
                          <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{insumo.descricao}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 font-mono text-gray-500 text-xs whitespace-nowrap">
                        {insumo.cas_number ?? '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium">
                          {insumo.unidade_padrao}
                        </span>
                      </td>
                      <td className="px-6 py-3 max-w-xs">
                        {syns.length > 0 ? (
                          <div className="flex items-start gap-1.5 flex-wrap">
                            <Tag size={12} className="text-gray-400 shrink-0 mt-0.5" />
                            {syns.slice(0, 4).map((s, i) => (
                              <span key={i} className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                                {s.sinonimo}
                              </span>
                            ))}
                            {syns.length > 4 && (
                              <span className="text-xs text-gray-400 italic">+{syns.length - 4} mais</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/insumos/${insumo.id}`}
                          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-xs"
                        >
                          <Pencil size={13} />
                          Editar
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>
                Exibindo {offset + 1}–{Math.min(offset + POR_PAGINA, total)} de {total.toLocaleString('pt-BR')}
              </span>
              <div className="flex items-center gap-1">
                {pagina > 1 && (
                  <Link href={url(pagina - 1)} className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors">
                    ← Anterior
                  </Link>
                )}
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  const start = Math.max(1, Math.min(pagina - 2, totalPaginas - 4))
                  const pg = start + i
                  if (pg > totalPaginas) return null
                  return (
                    <Link
                      key={pg}
                      href={url(pg)}
                      className={`px-3 py-1.5 rounded border transition-colors ${pg === pagina ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}
                    >
                      {pg}
                    </Link>
                  )
                })}
                {pagina < totalPaginas && (
                  <Link href={url(pagina + 1)} className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors">
                    Próxima →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
