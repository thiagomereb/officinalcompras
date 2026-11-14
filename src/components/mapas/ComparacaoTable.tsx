'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Save, FileDown, ShoppingCart, Wand2 } from 'lucide-react'
import type { CandidatoItem, GrupoInsumo } from '@/lib/comparacao'
import type { salvarSelecoes, aprovarMapa } from '@/app/(dashboard)/mapas/actions'
import { sugestaoDoGrupo, valorEstimado } from '@/lib/compras'
import type { QuantidadePedida, UltimaCompra } from '@/lib/mapas'
import { UNIDADES_QUANTIDADE, ehUnidadeQuantidade, type UnidadeQuantidade } from '@/lib/unidades'
import { LeituraPreco } from '@/components/ui/LeituraPreco'

type InfoDuplicata = { outroId: string; outroNome: string; eMaisBarato: boolean; diffPct: number }

export type EscolhaSalva = {
  cotacao_item_id: string
  quantidade: number | null
  quantidade_unidade: string | null
}

interface Props {
  grupos: GrupoInsumo[]
  escolhasSalvas: Record<string, EscolhaSalva>
  // Quanto a cotação própria pediu de cada insumo: é a quantidade inicial da compra
  quantidadesPedidas?: Record<string, QuantidadePedida>
  mapaId: string
  // Mapa aprovado ou cancelado: só leitura
  congelado: boolean
  // Mapa cancelado não gera ordem de compra
  ordemCompra?: boolean
  ultimasCompras?: Record<string, UltimaCompra>
  duplicatasInfo?: Record<string, InfoDuplicata>
  onSalvar?: typeof salvarSelecoes
  onAprovar?: typeof aprovarMapa
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

// Ao escolher uma oferta, a unidade da quantidade começa na da embalagem
// (kg para "1 kg"), ou na base da grandeza; o comprador troca se quiser
function unidadePadrao(c: CandidatoItem): UnidadeQuantidade | '' {
  if (ehUnidadeQuantidade(c.unidade)) return c.unidade
  if (c.unidade_base === 'g' || c.unidade_base === 'mL' || c.unidade_base === 'un') return c.unidade_base
  return ''
}

export function ComparacaoTable({
  grupos,
  escolhasSalvas,
  quantidadesPedidas = {},
  mapaId,
  congelado,
  ordemCompra = false,
  ultimasCompras = {},
  duplicatasInfo,
  onSalvar,
  onAprovar,
}: Props) {
  const salvas = Object.entries(escolhasSalvas)
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() =>
    Object.fromEntries(salvas.map(([k, v]) => [k, v.cotacao_item_id])),
  )
  // A quantidade salva vale; sem ela, começa pela quantidade pedida na cotação própria
  const [quantidades, setQuantidades] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(Object.entries(quantidadesPedidas).map(([k, v]) => [k, String(v.quantidade)])),
    ...Object.fromEntries(salvas.flatMap(([k, v]) => (v.quantidade != null ? [[k, String(v.quantidade)]] : []))),
  }))
  const [unidades, setUnidades] = useState<Record<string, UnidadeQuantidade | ''>>(() => ({
    ...Object.fromEntries(Object.entries(quantidadesPedidas).map(([k, v]) => [k, v.unidade])),
    ...Object.fromEntries(
      salvas.flatMap(([k, v]) =>
        v.quantidade != null && ehUnidadeQuantidade(v.quantidade_unidade) ? [[k, v.quantidade_unidade]] : [],
      ),
    ),
  }))
  const [alterado, setAlterado] = useState(false)
  // A ordem de compra sai das escolhas gravadas: no rascunho, precisa ter salvo
  const [temSalvas, setTemSalvas] = useState(salvas.length > 0)
  const [acao, setAcao] = useState<'salvar' | 'aprovar' | null>(null)
  const [pending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null)

  function marcarAlterado() {
    setAlterado(true)
    setMensagem(null)
  }

  function escolher(insumoId: string, candidato: CandidatoItem) {
    if (congelado) return
    setEscolhas((s) => ({ ...s, [insumoId]: candidato.cotacao_item_id }))
    if (!unidades[insumoId]) setUnidades((u) => ({ ...u, [insumoId]: unidadePadrao(candidato) }))
    marcarAlterado()
  }

  function naoComprar(insumoId: string) {
    setEscolhas((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== insumoId)))
    marcarAlterado()
  }

  // Decisão explícita do comprador, nunca automática
  function usarSugestoes() {
    const novas: Record<string, string> = {}
    const novasUnidades: Record<string, UnidadeQuantidade | ''> = {}
    for (const g of grupos) {
      const s = sugestaoDoGrupo(g)
      if (!escolhas[g.insumo_id] && s) {
        novas[g.insumo_id] = s.cotacao_item_id
        if (!unidades[g.insumo_id]) novasUnidades[g.insumo_id] = unidadePadrao(s)
      }
    }
    setEscolhas((e) => ({ ...e, ...novas }))
    setUnidades((u) => ({ ...u, ...novasUnidades }))
    marcarAlterado()
  }

  function payload() {
    return Object.entries(escolhas).map(([insumo_id, cotacao_item_id]) => ({
      insumo_id,
      cotacao_item_id,
      quantidade: quantidades[insumo_id] ? Number(quantidades[insumo_id]) : null,
      quantidade_unidade: unidades[insumo_id] || null,
    }))
  }

  function salvar() {
    if (!onSalvar) return
    setAcao('salvar')
    startTransition(async () => {
      const r = await onSalvar(mapaId, payload())
      if (r?.erro) {
        setMensagem({ ok: false, texto: r.erro })
        return
      }
      setAlterado(false)
      setTemSalvas(Object.keys(escolhas).length > 0)
      setMensagem({ ok: true, texto: 'Rascunho salvo.' })
    })
  }

  function aprovar() {
    if (!onAprovar) return
    if (!confirm('Aprovar a compra? O mapa vai para o histórico de compras e não poderá mais ser alterado, só cancelado.')) {
      return
    }
    setAcao('aprovar')
    startTransition(async () => {
      const r = await onAprovar(mapaId, payload())
      if (r?.erro) setMensagem({ ok: false, texto: r.erro })
    })
  }

  const candidatoEscolhido = (g: GrupoInsumo) => g.candidatos.find((c) => c.cotacao_item_id === escolhas[g.insumo_id])

  const totalEscolhidos = grupos.filter((g) => candidatoEscolhido(g)).length
  const totalEstimado = grupos.reduce((soma, g) => {
    const c = candidatoEscolhido(g)
    if (!c) return soma
    const v = valorEstimado(c, quantidades[g.insumo_id] ? Number(quantidades[g.insumo_id]) : null, unidades[g.insumo_id] || null)
    return v.tipo === 'valor' ? soma + v.valor : soma
  }, 0)
  const temSugestaoPendente = grupos.some((g) => !escolhas[g.insumo_id] && sugestaoDoGrupo(g))

  return (
    <div className="space-y-5">
      {/* Barra fixa no topo enquanto rola a lista de insumos */}
      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-linha bg-nevoa/95 px-4 py-3 backdrop-blur lg:top-0 lg:-mx-10 lg:px-10">
        <p className="text-[13px] text-ardosia">
          <span className="num font-medium text-grafite">{totalEscolhidos}</span> de{' '}
          <span className="num font-medium text-grafite">{grupos.length}</span> insumos com fornecedor escolhido
          {totalEstimado > 0 && (
            <>
              {' · '}total <span className="leitura font-medium text-grafite">{moeda(totalEstimado)}</span>
            </>
          )}
          {alterado && !congelado && <span className="ml-2 text-oxido">· alterações não salvas</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/mapas/${mapaId}/pdf`}
            download
            className="btn btn-secundario btn-sm"
            title={congelado ? 'Mapa com a comparação da aprovação' : 'Mapa com as escolhas salvas no rascunho'}
          >
            <FileDown size={14} />
            Baixar PDF
          </a>
          {ordemCompra &&
            (congelado || (temSalvas && !alterado) ? (
              <Link href={`/mapas/${mapaId}/ordem-compra`} className="btn btn-secundario btn-sm" title="Um pedido por fornecedor, com os itens escolhidos">
                <ShoppingCart size={14} />
                Ordem de compra
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="btn btn-secundario btn-sm"
                title={temSalvas ? 'Salve o rascunho para a ordem usar as escolhas atuais' : 'Escolha os fornecedores e salve o rascunho para gerar a ordem'}
              >
                <ShoppingCart size={14} />
                Ordem de compra
              </button>
            ))}
          {!congelado && (
            <>
              {temSugestaoPendente && (
                <button
                  onClick={usarSugestoes}
                  disabled={pending}
                  className="btn btn-secundario btn-sm"
                  title="Marca a sugestão do sistema só nos insumos que ainda não têm escolha"
                >
                  <Wand2 size={14} />
                  Usar sugestão nos sem escolha
                </button>
              )}
              <button onClick={salvar} disabled={pending} className="btn btn-secundario btn-sm">
                {pending && acao === 'salvar' ? <span className="girador" aria-hidden="true" /> : <Save size={14} />}
                {pending && acao === 'salvar' ? 'Salvando…' : 'Salvar rascunho'}
              </button>
              <button onClick={aprovar} disabled={pending} className="btn btn-primario btn-sm">
                {pending && acao === 'aprovar' ? <span className="girador" aria-hidden="true" /> : <Check size={14} />}
                {pending && acao === 'aprovar' ? 'Aprovando…' : 'Aprovar compra'}
              </button>
            </>
          )}
        </div>
        {mensagem && (
          <p role={mensagem.ok ? 'status' : 'alert'} className={`basis-full text-[13px] ${mensagem.ok ? 'text-salvia' : 'text-oxido'}`}>
            {mensagem.texto}
          </p>
        )}
      </div>

      {!congelado && (
        <p className="text-[12.5px] text-ardosia">
          A <span className="font-medium text-grafite">sugestão</span> é a oferta de menor preço por unidade base. Prazos e
          frete ficam ao lado para você pesar. A escolha é sua: clique na oferta que vai comprar.
        </p>
      )}

      {grupos.map((grupo) => {
        const escolhido = candidatoEscolhido(grupo)
        const sugestao = sugestaoDoGrupo(grupo)
        const duplicata = duplicatasInfo?.[grupo.insumo_id]
        const ultima = ultimasCompras[grupo.insumo_id]
        const qtd = quantidades[grupo.insumo_id] ?? ''
        const unidade = unidades[grupo.insumo_id] ?? ''
        const valor = escolhido ? valorEstimado(escolhido, qtd ? Number(qtd) : null, unidade || null) : null

        return (
          <section key={grupo.insumo_id} className="painel" aria-labelledby={`insumo-${grupo.insumo_id}`}>
            <div className="painel-topo">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`insumo-${grupo.insumo_id}`} className="painel-titulo">
                    {grupo.insumo_nome}
                  </h3>
                  {duplicata &&
                    (duplicata.eMaisBarato ? (
                      <span className="selo">mais barato que &ldquo;{duplicata.outroNome}&rdquo;, mesmo insumo</span>
                    ) : (
                      <span className="selo selo-alerta">
                        +{duplicata.diffPct.toFixed(0)}% que &ldquo;{duplicata.outroNome}&rdquo;, mesmo insumo
                      </span>
                    ))}
                  {congelado && !escolhido && <span className="selo">não comprado</span>}
                </div>
                {ultima && (
                  <p className="mt-0.5 text-[12.5px] text-ardosia">
                    Última compra: <LeituraPreco valor={ultima.preco_base} base={ultima.unidade_base} /> ·{' '}
                    {ultima.fornecedor_nome} ·{' '}
                    <Link href={`/mapas/${ultima.mapa_id}`} className="underline-offset-2 hover:underline">
                      {data(ultima.aprovado_em)}
                    </Link>
                  </p>
                )}
              </div>
              <span className="text-[12.5px] text-ardosia">{grupo.candidatos.length} oferta(s)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="tabela tabela-compacta whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="w-10">
                      <span className="sr-only">Escolher</span>
                    </th>
                    <th>Fornecedor</th>
                    <th className="num">Preço</th>
                    <th>Embalagem</th>
                    <th className="num">Por unidade base</th>
                    <th className="num">Entrega</th>
                    <th className="num">Pgto</th>
                    <th className="num">Frete</th>
                    <th>Validade lote</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.candidatos.map((c) => {
                    const isEscolhido = escolhido?.cotacao_item_id === c.cotacao_item_id
                    const isSugestao = sugestao?.cotacao_item_id === c.cotacao_item_id
                    return (
                      <tr
                        key={c.cotacao_item_id}
                        onClick={() => escolher(grupo.insumo_id, c)}
                        className={`${congelado ? '' : 'cursor-pointer'} ${isEscolhido ? 'escolhido' : ''}`}
                      >
                        <td>
                          <input
                            type="radio"
                            name={`escolha-${grupo.insumo_id}`}
                            checked={isEscolhido}
                            disabled={congelado}
                            onChange={() => escolher(grupo.insumo_id, c)}
                            aria-label={`Escolher ${c.fornecedor_nome}`}
                            className="h-4 w-4 cursor-pointer accent-grafite"
                          />
                        </td>
                        <td>
                          <span className={isEscolhido ? 'font-medium' : ''}>{c.fornecedor_nome}</span>
                          {isSugestao && <span className="selo ml-2 h-5 px-1.5 text-[11px]">sugestão</span>}
                        </td>
                        <td className="num leitura">{moeda(c.preco_unitario)}</td>
                        <td className="text-ardosia">
                          {c.quantidade_minima ? `${c.quantidade_minima} ` : ''}
                          {c.unidade ?? '—'}
                        </td>
                        <td className="num">
                          <LeituraPreco valor={c.preco_base} base={c.unidade_base} className={isEscolhido ? 'font-medium' : ''} />
                          {!c.preco_comparavel && (
                            <div
                              className="text-[11px] text-oxido"
                              title="Unidade de outra grandeza que a dos demais fornecedores: o preço não dá para comparar"
                            >
                              unidade diferente
                            </div>
                          )}
                        </td>
                        <td className="num text-ardosia">{c.prazo_entrega_dias != null ? `${c.prazo_entrega_dias} d` : '—'}</td>
                        <td className="num text-ardosia">{c.prazo_pagamento_dias != null ? `${c.prazo_pagamento_dias} d` : '—'}</td>
                        <td className="num text-ardosia">
                          {c.frete_fixo == null ? '—' : c.frete_fixo > 0 ? moeda(c.frete_fixo) : 'grátis'}
                        </td>
                        <td className="text-ardosia">
                          {c.validade ? new Date(c.validade + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {escolhido && (
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-linha-2 px-4 py-3">
                <div>
                  <span className="legenda">Quantidade</span>
                  {congelado ? (
                    <p className="leitura text-[13.5px]">{qtd ? `${Number(qtd).toLocaleString('pt-BR')} ${unidade}` : '—'}</p>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qtd}
                        onChange={(e) => {
                          setQuantidades((q) => ({ ...q, [grupo.insumo_id]: e.target.value }))
                          marcarAlterado()
                        }}
                        aria-label={`Quantidade de ${grupo.insumo_nome}`}
                        className="campo campo-sm leitura w-28 text-right"
                        placeholder="0"
                      />
                      <select
                        value={unidade}
                        onChange={(e) => {
                          setUnidades((u) => ({ ...u, [grupo.insumo_id]: e.target.value as UnidadeQuantidade | '' }))
                          marcarAlterado()
                        }}
                        aria-label={`Unidade da quantidade de ${grupo.insumo_nome}`}
                        className="campo campo-sm w-20"
                      >
                        <option value="">—</option>
                        {UNIDADES_QUANTIDADE.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {quantidadesPedidas[grupo.insumo_id] && (
                    <p className="ajuda mt-1">
                      Pedido na cotação:{' '}
                      <span className="leitura">
                        {quantidadesPedidas[grupo.insumo_id].quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}{' '}
                        {quantidadesPedidas[grupo.insumo_id].unidade}
                      </span>
                    </p>
                  )}
                </div>

                <div className="min-w-[110px]">
                  <span className="legenda">Valor estimado</span>
                  <p className="text-[13.5px]">
                    {valor?.tipo === 'valor' ? (
                      <span className="leitura font-medium">{moeda(valor.valor)}</span>
                    ) : valor?.tipo === 'grandeza_diferente' ? (
                      <span className="text-oxido">oferta vendida por {valor.base}</span>
                    ) : valor?.tipo === 'sem_conversao' ? (
                      <span className="text-ardosia">sem conversão</span>
                    ) : (
                      <span className="text-ardosia-2">—</span>
                    )}
                  </p>
                </div>

                {!congelado && (
                  <button onClick={() => naoComprar(grupo.insumo_id)} className="btn btn-fantasma btn-sm ml-auto">
                    Não comprar
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
