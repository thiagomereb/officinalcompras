import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, Building2, ArrowUpRight } from 'lucide-react'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

export default async function FornecedoresPage() {
  const supabase = await createClient()
  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('*')
    .order('razao_social')

  const total = fornecedores?.length ?? 0
  const ativos = fornecedores?.filter((f) => f.ativo).length ?? 0

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Cadastros"
        titulo="Fornecedores"
        descricao={`${total} cadastrado(s) · ${ativos} ativo(s)`}
        acoes={
          <Link href="/fornecedores/novo" className="btn btn-primario">
            <Plus size={16} />
            Novo fornecedor
          </Link>
        }
      />

      {!fornecedores?.length ? (
        <Vazio
          icone={Building2}
          titulo="Nenhum fornecedor cadastrado"
          texto="Cadastre os fornecedores para registrar as cotações de cada um."
          acao={
            <Link href="/fornecedores/novo" className="btn btn-primario btn-sm">
              Novo fornecedor
            </Link>
          }
        />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
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
              {fornecedores.map((f) => (
                <tr key={f.id} className={f.ativo ? undefined : 'text-ardosia'}>
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
    </div>
  )
}
