import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { InsumoForm } from '@/components/insumos/InsumoForm'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import { atualizarInsumo, excluirInsumo } from '../actions'
import { ExcluirInsumoButton } from './ExcluirInsumoButton'

type Insumo = Tables<'insumos'>

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function EditarInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [insumoRes, sinonimosRes, comprasRes] = await Promise.all([
    supabase.from('insumos').select('*').eq('id', id).single(),
    supabase.from('insumo_sinonimos').select('*').eq('insumo_id', id).order('sinonimo'),
    supabase
      .from('historico_compras')
      .select('id, mapa_id, mapa_titulo, aprovado_em, fornecedor_nome, quantidade, quantidade_unidade, preco_base, unidade_base, valor_total')
      .eq('insumo_id', id)
      .order('aprovado_em', { ascending: false })
      .limit(10),
  ])

  const insumo = insumoRes.data as Insumo | null
  if (!insumo) notFound()

  const action = atualizarInsumo.bind(null, id)
  const compras = comprasRes.data ?? []

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: '/insumos', label: 'Insumos' }}
        grupo="Insumo"
        titulo={insumo.nome_padrao}
        descricao={insumo.cas_number ? <span className="leitura">CAS {insumo.cas_number}</span> : undefined}
        acoes={<ExcluirInsumoButton id={id} action={excluirInsumo} />}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
        <div className="painel p-5 lg:p-7">
          <InsumoForm insumo={insumo} sinonimos={sinonimosRes.data ?? []} action={action} />
        </div>

        <section className="painel">
          <div className="painel-topo">
            <div>
              <h2 className="painel-titulo">Últimas compras</h2>
              <p className="text-[12.5px] text-ardosia">Dos mapas de cotação aprovados</p>
            </div>
            {compras.length > 0 && (
              <Link href={`/compras?q=${encodeURIComponent(insumo.nome_padrao)}`} className="text-[12.5px] text-ardosia hover:text-grafite hover:underline">
                Ver todas
              </Link>
            )}
          </div>
          {compras.length === 0 ? (
            <p className="px-5 py-6 text-[13.5px] text-ardosia">Nenhuma compra aprovada deste insumo ainda.</p>
          ) : (
            <ul>
              {compras.map((c) => (
                <li key={c.id} className="border-b border-linha-2 px-5 py-3 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-medium">{c.fornecedor_nome ?? '—'}</span>
                    {c.preco_base != null && <LeituraPreco valor={c.preco_base} base={c.unidade_base} className="shrink-0" />}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ardosia">
                    {c.aprovado_em ? new Date(c.aprovado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                    {c.quantidade != null && (
                      <>
                        {' · '}
                        <span className="leitura">
                          {c.quantidade.toLocaleString('pt-BR')} {c.quantidade_unidade ?? ''}
                        </span>
                      </>
                    )}
                    {c.valor_total != null && <> · {moeda(c.valor_total)}</>}
                    {c.mapa_id && (
                      <>
                        {' · '}
                        <Link href={`/mapas/${c.mapa_id}`} className="hover:text-grafite hover:underline">
                          {c.mapa_titulo ?? 'mapa'}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
