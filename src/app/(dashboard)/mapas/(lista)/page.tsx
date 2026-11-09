import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Plus, GitCompare, ArrowUpRight, FileDown } from 'lucide-react'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const STATUS = {
  rascunho: { label: 'Rascunho', cls: '' },
  aprovado: { label: 'Aprovado', cls: 'selo-ok' },
  exportado: { label: 'Exportado', cls: 'selo-ok' },
  cancelado: { label: 'Cancelado', cls: 'selo-alerta' },
} as const

const FUSO = 'America/Sao_Paulo'
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function MapasPage() {
  const supabase = await createClient()
  const { data: mapas } = await supabase
    .from('mapas_cotacao')
    .select('id, titulo, status, cotacoes_ids, created_at, aprovado_em, aprovado_por, valor_total, mapa_cotacao_itens(id), cotacoes_proprias(id, numero, cotacoes(id))')
    .order('created_at', { ascending: false })

  const rascunhos = mapas?.filter((m) => m.status === 'rascunho').length ?? 0

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Compras"
        titulo="Mapas de cotação"
        descricao={`${mapas?.length ?? 0} mapa(s) · ${rascunhos} em rascunho`}
        acoes={
          <>
            <Link href="/compras" className="btn btn-secundario">
              Histórico de compras
            </Link>
            <Link href="/mapas/novo" className="btn btn-primario">
              <Plus size={16} />
              Novo mapa
            </Link>
          </>
        }
      />

      {!mapas?.length ? (
        <Vazio
          icone={GitCompare}
          titulo="Nenhum mapa de cotação"
          texto="Um mapa compara os orçamentos de uma cotação própria, produto por produto. O comprador escolhe a oferta de cada um e aprova a compra."
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
                <th>Situação</th>
                <th className="num">Insumos escolhidos</th>
                <th className="num">Valor</th>
                <th>Aprovação</th>
                <th>Criado em</th>
                <th>
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mapas.map((m) => {
                const status = STATUS[m.status as keyof typeof STATUS] ?? STATUS.rascunho
                const totalItens = (m.mapa_cotacao_itens as { id: string }[])?.length ?? 0
                const cotacao = m.cotacoes_proprias as { id: string; numero: string; cotacoes: { id: string }[] } | null
                // Rascunho compara os orçamentos que a cotação tem agora; aprovado, os que foram gravados
                const orcamentos = cotacao && m.status === 'rascunho' ? cotacao.cotacoes.length : m.cotacoes_ids.length

                return (
                  <tr key={m.id} className={m.status === 'cancelado' ? 'text-ardosia' : undefined}>
                    <td>
                      <Link href={`/mapas/${m.id}`} className="font-medium hover:underline">
                        {m.titulo}
                      </Link>
                      <p className="text-[12px] text-ardosia">
                        {cotacao && <>Cotação {cotacao.numero} · </>}
                        {orcamentos} orçamento(s)
                      </p>
                    </td>
                    <td>
                      <span className={`selo ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="num text-ardosia">{totalItens}</td>
                    <td className="num leitura whitespace-nowrap">
                      {m.valor_total != null ? moeda(m.valor_total) : <span className="text-ardosia-2">—</span>}
                    </td>
                    <td className="whitespace-nowrap text-[12.5px] text-ardosia">
                      {m.aprovado_em ? (
                        <>
                          {new Date(m.aprovado_em).toLocaleDateString('pt-BR', { timeZone: FUSO })}
                          {m.aprovado_por && <p className="max-w-[200px] truncate">{m.aprovado_por}</p>}
                        </>
                      ) : (
                        <span className="text-ardosia-2">—</span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap text-ardosia">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '—'}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/mapas/${m.id}/pdf`}
                          download
                          className="btn btn-fantasma btn-icone btn-sm"
                          aria-label={`Baixar PDF de ${m.titulo}`}
                          title="Baixar PDF"
                        >
                          <FileDown size={14} />
                        </a>
                        <Link
                          href={`/mapas/${m.id}`}
                          className="btn btn-fantasma btn-icone btn-sm"
                          aria-label={`Abrir ${m.titulo}`}
                          title="Abrir mapa"
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </div>
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
