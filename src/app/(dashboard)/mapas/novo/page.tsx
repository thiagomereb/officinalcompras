import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NovoMapaForm } from '@/components/mapas/NovoMapaForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'
import { criarMapa } from '../actions'

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export default async function NovoMapaPage({ searchParams }: { searchParams: Promise<{ cotacao?: string }> }) {
  const { cotacao: marcada } = await searchParams
  const supabase = await createClient()
  const { data: cotacoes } = await supabase
    .from('cotacoes_proprias')
    .select('id, numero, unidade, emitida_em, cotacoes(id), cotacao_propria_itens(count), mapas_cotacao(id)')
    .order('created_at', { ascending: false })

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/mapas', label: 'Mapas de cotação' }}
        titulo="Novo mapa de cotação"
        descricao="Escolha a cotação própria: o mapa compara os orçamentos que os fornecedores mandaram para ela."
      />

      {!cotacoes?.length ? (
        <Vazio
          icone={ClipboardList}
          titulo="Nenhuma cotação própria"
          texto="O mapa compara os orçamentos de uma cotação própria. Importe a cotação e adicione os orçamentos primeiro."
          acao={
            <Link href="/cotacoes-proprias/nova" className="btn btn-primario btn-sm">
              Importar cotação
            </Link>
          }
        />
      ) : (
        <NovoMapaForm action={criarMapa}>
          <section className="painel">
            <div className="painel-topo">
              <div>
                <h2 className="painel-titulo">Cotação própria</h2>
                <p className="text-[12.5px] text-ardosia">
                  Enquanto o mapa for rascunho, os orçamentos que chegarem depois também entram.
                </p>
              </div>
            </div>
            <ul>
              {cotacoes.map((c) => {
                const orcamentos = (c.cotacoes as { id: string }[]).length
                const produtos = (c.cotacao_propria_itens as { count: number }[])[0]?.count ?? 0
                const mapas = (c.mapas_cotacao as { id: string }[]).length
                const semOrcamento = orcamentos === 0
                return (
                  <li key={c.id} className="border-b border-linha-2 last:border-0">
                    <label
                      className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                        semOrcamento
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:bg-nevoa/60 has-[:checked]:bg-ambar-veu/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cotacao_propria_id"
                        value={c.id}
                        required
                        disabled={semOrcamento}
                        defaultChecked={c.id === marcada && !semOrcamento}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">Cotação {c.numero}</span>
                        <span className="block text-[12.5px] text-ardosia">
                          {[c.unidade, c.emitida_em && `emitida em ${dataHora(c.emitida_em)}`, `${produtos} produto(s)`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[12.5px]">
                        <span className={`block ${semOrcamento ? 'text-oxido' : 'text-grafite'}`}>
                          {semOrcamento ? 'sem orçamento' : `${orcamentos} orçamento(s)`}
                        </span>
                        {mapas > 0 && <span className="block text-ardosia">{mapas} mapa(s) já criado(s)</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="painel p-5 lg:p-6">
            <label htmlFor="mapa-titulo" className="legenda">
              Título
            </label>
            <input
              id="mapa-titulo"
              name="titulo"
              maxLength={200}
              className="campo"
              placeholder="Em branco, fica “Cotação” e o número dela"
            />
          </section>
        </NovoMapaForm>
      )}
    </div>
  )
}
