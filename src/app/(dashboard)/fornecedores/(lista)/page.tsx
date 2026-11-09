import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Building2, ArrowUpRight, Search } from 'lucide-react'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inativos?: string }>
}) {
  const { q = '', inativos } = await searchParams
  const mostrarInativos = inativos === '1'

  const supabase = await createClient()
  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('*')
    .order('razao_social')

  const todos = fornecedores ?? []
  const ativos = todos.filter((f) => f.ativo).length
  const termo = normalizar(q.trim())
  const digitos = q.replace(/\D/g, '')
  const visiveis = todos.filter((f) => {
    if (!mostrarInativos && !f.ativo) return false
    if (!termo) return true
    return (
      normalizar(`${f.razao_social} ${f.nome_fantasia ?? ''}`).includes(termo) ||
      (!!digitos && (f.codigo === digitos || (f.cnpj ?? '').replace(/\D/g, '').includes(digitos)))
    )
  })

  const url = (params: { q?: string; inativos?: boolean }) => {
    const p = new URLSearchParams()
    if (params.q) p.set('q', params.q)
    if (params.inativos) p.set('inativos', '1')
    const s = p.toString()
    return s ? `/fornecedores?${s}` : '/fornecedores'
  }

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Cadastros"
        titulo="Fornecedores"
        descricao={`${todos.length} cadastrado(s) · ${ativos} ativo(s)`}
        acoes={
          <Link href="/fornecedores/novo" className="btn btn-primario">
            <Plus size={16} />
            Novo fornecedor
          </Link>
        }
      />

      {!todos.length ? (
        <Vazio
          icone={Building2}
          titulo="Nenhum fornecedor cadastrado"
          texto="Cadastre os fornecedores para registrar os orçamentos de cada um."
          acao={
            <Link href="/fornecedores/novo" className="btn btn-primario btn-sm">
              Novo fornecedor
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <form method="GET" role="search" className="relative w-full sm:w-96">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Buscar por nome, código ou CNPJ"
                aria-label="Buscar fornecedores"
                className="campo pl-8"
              />
              {mostrarInativos && <input type="hidden" name="inativos" value="1" />}
            </form>
            <Link href={url({ q, inativos: !mostrarInativos })} className="text-[13px] text-ardosia hover:text-grafite hover:underline">
              {mostrarInativos ? 'Esconder inativos' : `Mostrar inativos (${todos.length - ativos})`}
            </Link>
          </div>

          {!visiveis.length ? (
            <Vazio icone={Search} titulo="Nenhum fornecedor encontrado" texto={`Nada corresponde a “${q}”.`} />
          ) : (
            <div className="painel overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="num">Código</th>
                    <th>Fornecedor</th>
                    <th>Contato</th>
                    <th>CNPJ</th>
                    <th>Situação</th>
                    <th>
                      <span className="sr-only">Editar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((f) => (
                    <tr key={f.id} className={f.ativo ? undefined : 'text-ardosia'}>
                      <td className="num leitura text-[12.5px] text-ardosia">{f.codigo ?? '—'}</td>
                      <td>
                        <Link href={`/fornecedores/${f.id}`} className="font-medium hover:underline">
                          {f.nome_fantasia ?? f.razao_social}
                        </Link>
                        {f.nome_fantasia && <p className="text-[12px] text-ardosia">{f.razao_social}</p>}
                      </td>
                      <td className="text-[13px]">
                        {f.email && <p className="truncate">{f.email}</p>}
                        {f.telefone && <p className="leitura text-[12.5px] text-ardosia">{f.telefone}</p>}
                        {!f.email && !f.telefone && <span className="text-ardosia-2">—</span>}
                      </td>
                      <td className="leitura whitespace-nowrap text-[12.5px] text-ardosia">{f.cnpj ?? '—'}</td>
                      <td>
                        <span className={`selo ${f.ativo ? 'selo-ok' : ''}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className="w-10">
                        <Link
                          href={`/fornecedores/${f.id}`}
                          className="btn btn-fantasma btn-icone btn-sm"
                          aria-label={`Editar ${f.nome_fantasia ?? f.razao_social}`}
                          title="Editar"
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
