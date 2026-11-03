import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Indicadores } from '@/components/dashboard/Indicadores'

const LISTAS = [
  { titulo: 'Histórico de compras', desc: 'Tudo que foi aprovado, com preço, quantidade e valor; filtra por insumo, fornecedor e período.', href: '/compras' },
  { titulo: 'Mapas aprovados', desc: 'Abra o mapa e use “Imprimir” para gerar o PDF assinável.', href: '/mapas' },
  { titulo: 'Cotações recebidas', desc: 'Todas as tabelas de preço, com arquivo original e itens.', href: '/cotacoes' },
  { titulo: 'Fornecedores', desc: 'Dados cadastrais e situação de cada fornecedor.', href: '/fornecedores' },
  { titulo: 'Insumos', desc: 'Tabela mestre com CAS e sinônimos.', href: '/insumos' },
]

export default async function RelatoriosPage() {
  const supabase = await createClient()

  const [
    { count: totalFornecedores },
    { count: totalInsumos },
    { count: totalCotacoes },
    { count: totalMapas },
    { count: mapaAprovados },
  ] = await Promise.all([
    supabase.from('fornecedores').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('insumos').select('*', { count: 'exact', head: true }),
    supabase.from('cotacoes').select('*', { count: 'exact', head: true }),
    supabase.from('mapas_cotacao').select('*', { count: 'exact', head: true }),
    supabase.from('mapas_cotacao').select('*', { count: 'exact', head: true }).eq('status', 'aprovado'),
  ])

  const n = (v: number | null) => (v ?? 0).toLocaleString('pt-BR')

  return (
    <div className="pagina">
      <Cabecalho grupo="Sistema" titulo="Relatórios" descricao="O que está registrado no sistema hoje." />

      <Indicadores
        itens={[
          { rotulo: 'Cotações', valor: n(totalCotacoes), detalhe: 'recebidas no total' },
          { rotulo: 'Mapas', valor: n(totalMapas), detalhe: `${n(mapaAprovados)} aprovado(s)` },
          { rotulo: 'Fornecedores', valor: n(totalFornecedores), detalhe: 'ativos' },
          { rotulo: 'Insumos', valor: n(totalInsumos), detalhe: 'na tabela mestre' },
        ]}
      />

      <section className="painel max-w-3xl">
        <div className="painel-topo">
          <div>
            <h2 className="painel-titulo">Consultar e exportar</h2>
            <p className="text-[12.5px] text-ardosia">
              Exportação em planilha ainda não existe; por enquanto, os mapas saem em PDF pela impressão.
            </p>
          </div>
        </div>
        <ul>
          {LISTAS.map(({ titulo, desc, href }) => (
            <li key={titulo} className="border-b border-linha-2 last:border-0">
              <Link href={href} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-nevoa/60">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">{titulo}</span>
                  <span className="block text-[12.5px] text-ardosia">{desc}</span>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-ardosia transition-colors group-hover:text-grafite" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
