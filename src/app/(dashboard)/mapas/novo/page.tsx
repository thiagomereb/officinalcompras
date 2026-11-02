import Link from 'next/link'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PesosEditor } from '@/components/mapas/PesosEditor'
import { NovoMapaForm } from '@/components/mapas/NovoMapaForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'
import { PESOS_PADRAO } from '@/lib/comparacao'
import { criarMapa } from '../actions'

export default async function NovoMapaPage() {
  const supabase = await createClient()
  const { data: cotacoes } = await supabase
    .from('cotacoes')
    .select('id, data_cotacao, validade_cotacao, fornecedores(razao_social, nome_fantasia), cotacao_itens(id)')
    .eq('status', 'processado')
    .order('data_cotacao', { ascending: false })

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/mapas', label: 'Mapas de cotação' }}
        titulo="Novo mapa de cotação"
        descricao="Escolha as cotações que vão disputar e quanto pesa cada critério."
      />

      {!cotacoes?.length ? (
        <Vazio
          icone={FileText}
          titulo="Nenhuma cotação com itens"
          texto="O mapa compara itens já lançados. Abra uma cotação e extraia ou adicione os itens primeiro."
          acao={
            <>
              <Link href="/cotacoes" className="btn btn-secundario btn-sm">
                Ver cotações
              </Link>
              <Link href="/cotacoes/nova" className="btn btn-primario btn-sm">
                Nova cotação
              </Link>
            </>
          }
        />
      ) : (
        <NovoMapaForm action={criarMapa}>
          <section className="painel p-5 lg:p-6">
            <label htmlFor="mapa-titulo" className="legenda">
              Título <span className="obrigatorio">*</span>
            </label>
            <input
              id="mapa-titulo"
              name="titulo"
              required
              className="campo"
              placeholder="Compras de novembro — lote 1"
            />
          </section>

          <section className="painel">
            <div className="painel-topo">
              <div>
                <h2 className="painel-titulo">Cotações</h2>
                <p className="text-[12.5px] text-ardosia">Só aparecem cotações com itens lançados.</p>
              </div>
            </div>
            <ul>
              {cotacoes.map((c) => {
                const fornecedor = c.fornecedores as { razao_social: string; nome_fantasia: string | null } | null
                const totalItens = (c.cotacao_itens as { id: string }[])?.length ?? 0
                const vencida = !!c.validade_cotacao && c.validade_cotacao < hoje
                return (
                  <li key={c.id} className="border-b border-linha-2 last:border-0">
                    <label className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-nevoa/60 has-[:checked]:bg-ambar-veu/50">
                      <input type="checkbox" name="cotacoes_ids" value={c.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? '—'}
                        </span>
                        <span className="block text-[12.5px] text-ardosia">
                          {new Date(c.data_cotacao + 'T12:00:00').toLocaleDateString('pt-BR')} · {totalItens} item(ns)
                        </span>
                      </span>
                      {vencida && <span className="selo selo-alerta">vencida</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="painel p-5 lg:p-6">
            <h2 className="painel-titulo">Pesos dos critérios</h2>
            <p className="mb-5 text-[12.5px] text-ardosia">
              Somam 100%. Dentro de cada insumo, quem tem o melhor valor num critério leva o peso inteiro dele, e o pior
              leva zero.
            </p>
            <PesosEditor inicial={PESOS_PADRAO} />
          </section>
        </NovoMapaForm>
      )}
    </div>
  )
}
