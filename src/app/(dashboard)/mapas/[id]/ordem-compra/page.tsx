import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, Ban, FileDown, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { carregarOrdensCompra } from '@/lib/mapas'
import { Cabecalho } from '@/components/ui/Cabecalho'
import { Vazio } from '@/components/ui/Vazio'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Prévia das ordens de compra do mapa: uma por fornecedor. Dá para ver cada
// uma, baixar só a de um fornecedor ou todas num PDF só.
export default async function OrdemCompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ f?: string }>
}) {
  const { id } = await params
  const { f } = await searchParams
  const supabase = await createClient()

  const doc = await carregarOrdensCompra(supabase, id)
  if (!doc) notFound()

  const { mapa, ordens } = doc
  const selecionada = ordens.find((o) => o.chave === f) ?? ordens[0]
  const total = ordens.reduce((s, o) => s + o.total, 0)
  const pdf = `/mapas/${id}/ordem-compra/pdf`

  return (
    <div className="pagina">
      <Cabecalho
        voltar={{ href: `/mapas/${id}`, label: mapa.titulo }}
        grupo="Mapa de cotação"
        titulo="Ordem de compra"
        descricao={
          ordens.length > 0 && mapa.status !== 'cancelado' ? (
            <>
              {doc.numero && <>Pedido nº {doc.numero} · </>}
              {ordens.length} fornecedor(es) · total <span className="leitura text-grafite">{moeda(total)}</span>
            </>
          ) : undefined
        }
        acoes={
          ordens.length > 0 && mapa.status !== 'cancelado' ? (
            <a href={pdf} download className="btn btn-secundario btn-sm" title="Um PDF com a ordem de cada fornecedor, uma por página">
              <FileDown size={14} />
              Baixar todas
            </a>
          ) : undefined
        }
      />

      {mapa.status === 'cancelado' ? (
        <Vazio icone={Ban} titulo="Mapa cancelado" texto="Mapa cancelado não gera ordem de compra." />
      ) : ordens.length === 0 ? (
        <Vazio
          icone={ShoppingCart}
          titulo="Nenhum insumo com fornecedor escolhido"
          texto="Escolha os fornecedores no mapa e salve o rascunho (ou aprove a compra) para gerar a ordem."
          acao={
            <Link href={`/mapas/${id}`} className="btn btn-primario btn-sm">
              Voltar ao mapa
            </Link>
          }
        />
      ) : (
        <>
          {doc.rascunho && (
            <p className="aviso aviso-atencao mb-4" role="status">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                O mapa ainda é rascunho: a ordem usa as escolhas salvas, que podem mudar até a compra ser aprovada.
              </span>
            </p>
          )}
          {!doc.empresa && (
            <p className="aviso aviso-atencao mb-4" role="status">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>Os dados da farmácia não estão cadastrados: a ordem sai sem o rodapé.</span>
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <section className="painel self-start">
              <div className="painel-topo">
                <h2 className="painel-titulo">Fornecedores</h2>
              </div>
              <ul>
                {ordens.map((o) => {
                  const ativa = o.chave === selecionada.chave
                  return (
                    <li
                      key={o.chave}
                      className={`flex items-center gap-2 border-b border-linha-2 px-4 py-3 last:border-0 ${ativa ? 'bg-ambar-veu/50' : ''}`}
                    >
                      <Link
                        href={`/mapas/${id}/ordem-compra?f=${o.chave}`}
                        scroll={false}
                        aria-current={ativa ? 'true' : undefined}
                        className="min-w-0 flex-1"
                      >
                        <span className="block truncate text-[13.5px] font-medium hover:underline">{o.fornecedor}</span>
                        <span className="block text-[12.5px] text-ardosia">
                          {o.linhas.length} item(ns) · <span className="leitura">{moeda(o.total)}</span>
                          {o.incompleto && <span className="text-oxido"> · item sem valor</span>}
                        </span>
                      </Link>
                      <a
                        href={`${pdf}?f=${o.chave}`}
                        download
                        className="btn btn-fantasma btn-icone btn-sm"
                        aria-label={`Baixar a ordem de ${o.fornecedor}`}
                        title="Baixar só esta ordem"
                      >
                        <FileDown size={14} />
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="painel overflow-hidden">
              <div className="painel-topo">
                <h2 className="painel-titulo truncate">{selecionada.fornecedor}</h2>
                <a href={`${pdf}?f=${selecionada.chave}`} download className="btn btn-secundario btn-sm">
                  <FileDown size={14} />
                  Baixar esta
                </a>
              </div>
              <iframe
                key={selecionada.chave}
                src={`${pdf}?f=${selecionada.chave}&ver=1`}
                title={`Ordem de compra de ${selecionada.fornecedor}`}
                className="block h-[78vh] w-full border-0 bg-nevoa"
              />
            </section>
          </div>
        </>
      )}
    </div>
  )
}
