'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileUp, Pencil } from 'lucide-react'
import { enviarArquivoCotacao, removerArquivoCotacao, ACCEPT_ARQUIVO_COTACAO, LIMITE_ARQUIVO_BYTES } from '@/lib/supabase/upload'
import { lerOrcamento } from '@/lib/orcamento-browser'
import { conferirTotal, itemParaGravar, type OrcamentoLido } from '@/lib/orcamento'
import { reconhecerFornecedor, type FornecedorCadastro, type Reconhecimento } from '@/lib/reconhecer-fornecedor'
import { precoPorUnidadeBase } from '@/lib/unidades'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import type { salvarOrcamento } from '@/app/(dashboard)/cotacoes-proprias/orcamentos-actions'
import { SeletorProdutoPedido, type ProdutoPedidoOpcao } from './SeletorProdutoPedido'

type Fornecedor = FornecedorCadastro

const nomeFornecedor = (f: Fornecedor) => f.nome_fantasia ?? f.razao_social

interface Props {
  cotacaoPropriaId: string
  fornecedores: Fornecedor[]
  pedidos: ProdutoPedidoOpcao[]
  action: typeof salvarOrcamento
}

// O vínculo de cada item na prévia: o que a leitura sugeriu ou o que o comprador escolheu
type Vinculo = { codigo: string | null; conferido: boolean }
type Filtro = 'ligados' | 'fora' | 'todos'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function AdicionarOrcamento({ cotacaoPropriaId, fornecedores, pedidos, action }: Props) {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [lido, setLido] = useState<(OrcamentoLido & { paginas: number }) | null>(null)
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [reconhecimento, setReconhecimento] = useState<Reconhecimento | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<number | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startTransition] = useTransition()

  const pedidoPorCodigo = useMemo(() => new Map(pedidos.map((p) => [p.codigo, p])), [pedidos])

  async function ler(f: File) {
    setArquivo(f)
    setLido(null)
    setErro(null)
    setEditando(null)
    if (f.size > LIMITE_ARQUIVO_BYTES) {
      setErro(`Arquivo muito grande. O limite é ${LIMITE_ARQUIVO_BYTES / 1024 / 1024} MB.`)
      return
    }
    try {
      const r = await lerOrcamento(f, cotacaoPropriaId, setProgresso)
      if (r.itens.length === 0) {
        setErro('Não encontrei itens com preço neste arquivo.')
        return
      }
      const reconhecido = reconhecerFornecedor(fornecedores, r.cabecalho.cnpj, r.textoCabecalho)
      setFornecedorId(reconhecido.id)
      setReconhecimento(reconhecido)
      setVinculos(r.itens.map((i) => ({ codigo: i.codigo_pedido, conferido: false })))
      setFiltro('todos')
      setLido(r)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProgresso(null)
    }
  }

  function vincular(indice: number, produto: ProdutoPedidoOpcao | null) {
    setVinculos((v) => v.map((x, k) => (k === indice ? { codigo: produto?.codigo ?? null, conferido: true } : x)))
    setEditando(null)
  }

  const resumo = useMemo(() => {
    if (!lido) return null
    const ligados = vinculos.filter((v) => v.codigo).length
    return {
      ligados,
      fora: vinculos.length - ligados,
      conferidos: vinculos.filter((v) => v.conferido).length,
      produtos: new Set(vinculos.flatMap((v) => (v.codigo ? [v.codigo] : []))).size,
      total: conferirTotal(lido.itens, lido.cabecalho.total_documento),
    }
  }, [lido, vinculos])

  function salvar() {
    if (!arquivo || !lido) return
    if (!fornecedorId) {
      setErro('Escolha o fornecedor do orçamento.')
      return
    }
    setErro(null)
    startTransition(async () => {
      let path: string | null = null
      try {
        path = await enviarArquivoCotacao(arquivo, arquivo.name)
        const r = await action({
          cotacaoPropriaId,
          fornecedorId,
          arquivoUrl: path,
          arquivoNome: arquivo.name,
          cabecalho: lido.cabecalho,
          itens: lido.itens.map((i, k) => ({ ...i, codigo_pedido: vinculos[k].codigo, conferido: vinculos[k].conferido })),
        })
        if ('erro' in r) {
          await removerArquivoCotacao(path)
          setErro(r.erro)
          return
        }
        router.push(`/cotacoes-proprias/${cotacaoPropriaId}/orcamentos/${r.id}`)
      } catch (e) {
        if (path) await removerArquivoCotacao(path)
        setErro((e as Error).message)
      }
    })
  }

  const lendo = progresso != null
  const cab = lido?.cabecalho
  const linhas = (lido?.itens ?? [])
    .map((item, indice) => ({ item, indice, vinculo: vinculos[indice] }))
    .filter(({ vinculo }) => filtro === 'todos' || (filtro === 'ligados' ? !!vinculo?.codigo : !vinculo?.codigo))

  return (
    <div className="space-y-5">
      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-linha bg-papel px-6 py-9 text-center transition-colors hover:bg-nevoa/60 ${lendo || salvando ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) void ler(f)
        }}
      >
        <FileUp size={22} strokeWidth={1.6} className="text-ardosia" />
        <span className="text-[13.5px] font-medium">{arquivo ? arquivo.name : 'Escolha ou arraste o orçamento do fornecedor'}</span>
        <span className="text-[12.5px] text-ardosia">PDF, planilha (XLSX/XLS) ou foto, até 10 MB</span>
        <input
          type="file"
          accept={ACCEPT_ARQUIVO_COTACAO}
          className="sr-only"
          disabled={lendo || salvando}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void ler(f)
            e.target.value = ''
          }}
        />
      </label>

      {lendo && (
        <p className="flex items-center gap-2 text-[13px] text-ardosia" role="status">
          <span className="girador" aria-hidden="true" />
          {progresso}
          <span className="text-ardosia-2">· a IA lê e liga cada item aos produtos pedidos, cerca de 20 s por página</span>
        </p>
      )}

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      {lido && cab && resumo && (
        <section className="painel">
          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="orc-fornecedor" className="legenda">
                  Fornecedor <span className="obrigatorio">*</span>
                </label>
                <select
                  id="orc-fornecedor"
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  className="campo"
                >
                  <option value="">Escolha…</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {nomeFornecedor(f)}
                      {f.codigo ? ` · ${f.codigo}` : ''}
                    </option>
                  ))}
                </select>
                {fornecedorId && reconhecimento?.motivo && reconhecimento.id === fornecedorId && (
                  <p className="ajuda">
                    {reconhecimento.motivo === 'cnpj'
                      ? 'Reconhecido pelo CNPJ do orçamento.'
                      : 'Reconhecido pelo nome da empresa no orçamento.'}
                  </p>
                )}
                {(reconhecimento?.alternativas.length ?? 0) > 0 && (
                  <div className="ajuda">
                    {cab.cnpj && (
                      <>
                        CNPJ do orçamento: <span className="leitura">{cab.cnpj}</span>.{' '}
                      </>
                    )}
                    {fornecedorId ? 'Outras empresas do mesmo CNPJ:' : 'Empresas do mesmo CNPJ no cadastro:'}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {[...reconhecimento!.alternativas, ...fornecedores.filter((f) => f.id === reconhecimento!.id)]
                        .filter((f) => f.id !== fornecedorId)
                        .map((f) => (
                          <button key={f.id} type="button" onClick={() => setFornecedorId(f.id)} className="btn btn-secundario btn-sm h-7">
                            {nomeFornecedor(f)}
                            {f.codigo && <span className="leitura text-ardosia">{f.codigo}</span>}
                          </button>
                        ))}
                    </span>
                  </div>
                )}
                {cab.cnpj && !fornecedorId && !reconhecimento?.alternativas.length && (
                  <p className="ajuda">
                    CNPJ do orçamento: <span className="leitura">{cab.cnpj}</span>, sem fornecedor com esse CNPJ no cadastro.
                    Escolha na lista (o CNPJ fica guardado nele) ou{' '}
                    <Link href="/fornecedores/novo" className="underline underline-offset-2" target="_blank">
                      cadastre
                    </Link>
                    .
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-ardosia">Orçamento</dt>
                <dd className="leitura">{cab.numero ?? '—'}</dd>
                <dt className="text-ardosia">Data</dt>
                <dd>{cab.data ? new Date(cab.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</dd>
                <dt className="text-ardosia">Validade</dt>
                <dd>{cab.validade_proposta ?? '—'}</dd>
                <dt className="text-ardosia">Pedido mínimo</dt>
                <dd>{cab.pedido_minimo ? moeda(cab.pedido_minimo) : '—'}</dd>
                <dt className="text-ardosia">Frete</dt>
                <dd>{cab.frete ?? '—'}</dd>
              </dl>
            </div>

            {resumo.total.bate === true && (
              <p className="text-[12.5px] text-salvia">
                A soma dos itens lidos bate com o total do documento ({moeda(cab.total_documento!)}).
              </p>
            )}
            {resumo.total.bate === false && (
              <p className="aviso aviso-atencao" role="status">
                A soma dos itens lidos ({moeda(resumo.total.soma)}, ou {moeda(resumo.total.somaComImpostos)} com impostos) não bate
                com o total do documento ({moeda(cab.total_documento!)}). Pode ter ficado item de fora.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-linha-2 px-5 py-3">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Itens do orçamento">
              {(
                [
                  ['todos', 'Todos', lido.itens.length],
                  ['ligados', 'Ligados a produtos pedidos', resumo.ligados],
                  ['fora', 'Fora da cotação', resumo.fora],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={filtro === id}
                  onClick={() => setFiltro(id)}
                  className={`btn btn-sm ${filtro === id ? 'btn-secundario' : 'btn-fantasma'}`}
                >
                  {label} <span className="leitura text-ardosia">{n}</span>
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-ardosia">
              Corrija pelo lápis o que a leitura ligou errado ou deixou de fora; o que você corrigir vira sinônimo do insumo.
            </p>
          </div>

          <div className="max-h-[560px] overflow-auto border-t border-linha-2">
            <table className="tabela tabela-compacta whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-papel">
                <tr>
                  <th>Item do fornecedor</th>
                  <th>Produto pedido</th>
                  <th>Embalagem</th>
                  <th className="num">Total</th>
                  <th className="num">Por unidade base</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ item: i, indice, vinculo }) => {
                  const g = itemParaGravar(i)
                  const base = precoPorUnidadeBase(g.preco_unitario, g.quantidade_minima, g.unidade)
                  const pedido = vinculo?.codigo ? pedidoPorCodigo.get(vinculo.codigo) : undefined
                  return (
                    <tr key={indice} className="group/linha align-top">
                      <td className="max-w-[300px]">
                        <div className="truncate" title={i.descricao}>
                          {i.descricao}
                        </div>
                        {i.obs && !vinculo?.conferido && (
                          <div className={`whitespace-normal text-[11.5px] ${i.codigo_pedido ? 'text-oxido' : 'text-ardosia'}`}>{i.obs}</div>
                        )}
                      </td>
                      <td className="min-w-[260px]">
                        {editando === indice ? (
                          <SeletorProdutoPedido
                            pedidos={pedidos}
                            onEscolher={(p) => vincular(indice, p)}
                            onCancelar={() => setEditando(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            {pedido ? (
                              <span className="truncate" title={`${pedido.codigo} · ${pedido.nome}`}>
                                {pedido.nome}
                              </span>
                            ) : (
                              <span className="text-ardosia-2">fora da cotação</span>
                            )}
                            {vinculo?.conferido && <span className="selo selo-ok h-5 shrink-0 px-1.5 text-[11px]">conferido</span>}
                            <button
                              type="button"
                              onClick={() => setEditando(indice)}
                              className="btn btn-fantasma btn-icone btn-sm h-6 w-6 shrink-0 opacity-40 group-hover/linha:opacity-100 focus-visible:opacity-100"
                              title={pedido ? 'Trocar o produto pedido' : 'Ligar a um produto pedido'}
                              aria-label={`${pedido ? 'Trocar' : 'Escolher'} o produto pedido de ${i.descricao}`}
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="text-ardosia">
                        {i.quantidade_embalagens !== 1 && `${i.quantidade_embalagens}× `}
                        {i.embalagem_quantidade.toLocaleString('pt-BR')} {g.unidade}
                      </td>
                      <td className="num leitura">{moeda(i.valor_total)}</td>
                      <td className="num">
                        <LeituraPreco valor={base.valor} base={base.base} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-linha-2 px-5 py-4">
            <button onClick={salvar} disabled={salvando} className="btn btn-primario">
              {salvando && <span className="girador" aria-hidden="true" />}
              {salvando ? 'Salvando…' : 'Salvar orçamento'}
            </button>
            <p className="text-[12.5px] text-ardosia">
              {resumo.ligados} item(ns) ligados a {resumo.produtos} produto(s) pedido(s)
              {resumo.conferidos > 0 && `, ${resumo.conferidos} conferido(s) por você`}. O resto fica como sugestão da leitura,
              para conferir no orçamento.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
