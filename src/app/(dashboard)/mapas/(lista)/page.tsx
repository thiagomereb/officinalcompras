import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, GitCompare, ArrowUpRight } from 'lucide-react'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const STATUS = {
  rascunho: { label: 'Rascunho', cls: '' },
  aprovado: { label: 'Aprovado', cls: 'selo-ok' },
  exportado: { label: 'Exportado', cls: 'selo-ok' },
} as const

export default async function MapasPage() {
  const supabase = await createClient()
  const { data: mapas } = await supabase
    .from('mapas_cotacao')
    .select('*, mapa_cotacao_itens(id)')
    .order('created_at', { ascending: false })

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Compras"
        titulo="Mapas de cotação"
        descricao={`${mapas?.length ?? 0} mapa(s)`}
        acoes={
          <Link href="/mapas/novo" className="btn btn-primario">
            <Plus size={16} />
            Novo mapa
          </Link>
        }
      />

      {!mapas?.length ? (
        <Vazio
          icone={GitCompare}
          titulo="Nenhum mapa de cotação"
          texto="Um mapa compara as cotações escolhidas, insumo por insumo, e registra o fornecedor vencedor de cada um."
          acao={
            <Link href="/mapas/novo" className="btn btn-primario btn-sm">
              Novo mapa
            </Link>
          }
        />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Título</th>
                <th className="num">Cotações</th>
                <th className="num">Insumos escolhidos</th>
                <th>Criado em</th>
                <th>Situação</th>
                <th>
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mapas.map((m) => {
                const status = STATUS[m.status as keyof typeof STATUS] ?? STATUS.rascunho
                const totalItens = (m.mapa_cotacao_itens as { id: string }[])?.length ?? 0

                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/mapas/${m.id}`} className="font-medium hover:underline">
                        {m.titulo}
                      </Link>
                    </td>
                    <td className="num text-ardosia">{m.cotacoes_ids.length}</td>
                    <td className="num text-ardosia">{totalItens}</td>
                    <td className="num whitespace-nowrap text-ardosia">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                    </td>
                    <td>
                      <span className={`selo ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="w-10">
                      <Link
                        href={`/mapas/${m.id}`}
                        className="btn btn-fantasma btn-icone btn-sm"
                        aria-label={`Abrir ${m.titulo}`}
                        title="Abrir mapa"
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
      )}
    </div>
  )
}
