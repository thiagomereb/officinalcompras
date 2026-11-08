import Link from 'next/link'
import { ClipboardList, FileUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

const STATUS = {
  aberta: { label: 'Aberta', cls: '' },
  concluida: { label: 'Concluída', cls: 'selo-ok' },
} as const

export default async function CotacoesPropriasPage() {
  const supabase = await createClient()
  const { data: cotacoes } = await supabase
    .from('cotacoes_proprias')
    .select('id, numero, unidade, emitida_em, status, importada_por, created_at, cotacao_propria_itens(count)')
    .order('created_at', { ascending: false })

  const importar = (
    <Link href="/cotacoes-proprias/nova" className="btn btn-primario">
      <FileUp size={16} />
      Importar cotação
    </Link>
  )

  return (
    <div className="pagina">
      <Cabecalho
        grupo="Compras"
        titulo="Cotações próprias"
        descricao="O pedido de cotação gerado no sistema da farmácia. Os orçamentos dos fornecedores entram dentro dele."
        acoes={cotacoes?.length ? importar : undefined}
      />

      {!cotacoes?.length ? (
        <Vazio
          icone={ClipboardList}
          titulo="Nenhuma cotação própria importada"
          texto="Gere o relatório “Produtos para cotação” no sistema da farmácia e importe o PDF aqui."
          acao={importar}
        />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Cotação</th>
                <th>Unidade</th>
                <th>Emitida em</th>
                <th className="num">Produtos</th>
                <th>Importada</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {cotacoes.map((c) => {
                const status = STATUS[c.status as keyof typeof STATUS] ?? STATUS.aberta
                const produtos = (c.cotacao_propria_itens as { count: number }[])[0]?.count ?? 0
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cotacoes-proprias/${c.id}`} className="leitura font-medium hover:underline">
                        {c.numero}
                      </Link>
                    </td>
                    <td className="text-ardosia">{c.unidade ?? '—'}</td>
                    <td className="whitespace-nowrap text-ardosia">{c.emitida_em ? dataHora(c.emitida_em) : '—'}</td>
                    <td className="num leitura">{produtos.toLocaleString('pt-BR')}</td>
                    <td className="whitespace-nowrap text-[12.5px] text-ardosia">
                      {dataHora(c.created_at)}
                      {c.importada_por && <span className="block">{c.importada_por}</span>}
                    </td>
                    <td>
                      <span className={`selo ${status.cls}`}>{status.label}</span>
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
