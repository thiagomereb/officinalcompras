'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileUp } from 'lucide-react'
import { enviarArquivoCotacao, removerArquivoCotacao, ACCEPT_ARQUIVO_COTACAO, LIMITE_ARQUIVO_BYTES } from '@/lib/supabase/upload'
import { lerOrcamento } from '@/lib/orcamento-browser'
import { conferirTotal, itemParaGravar, soDigitos, type OrcamentoLido } from '@/lib/orcamento'
import { precoPorUnidadeBase } from '@/lib/unidades'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import type { salvarOrcamento } from '@/app/(dashboard)/cotacoes-proprias/orcamentos-actions'

type Fornecedor = { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; codigo: string | null }

const nomeFornecedor = (f: Fornecedor) => f.nome_fantasia ?? f.razao_social

// Fornecedor do orçamento pelo CNPJ: o exato primeiro; senão a raiz (8 primeiros
// dígitos), que é a mesma em todas as filiais da empresa. Só escolhe sozinho
// quando sobra um; com mais de um, devolve os candidatos para o comprador.
function reconhecerFornecedor(fornecedores: Fornecedor[], cnpj: string | null): { id: string; candidatos: Fornecedor[] } {
  const digitos = soDigitos(cnpj)
  if (digitos.length < 8) return { id: '', candidatos: [] }
  const exatos = fornecedores.filter((f) => soDigitos(f.cnpj) === digitos)
  if (exatos.length === 1) return { id: exatos[0].id, candidatos: [] }
  const mesmaRaiz = exatos.length ? exatos : fornecedores.filter((f) => soDigitos(f.cnpj).slice(0, 8) === digitos.slice(0, 8))
  return mesmaRaiz.length === 1 ? { id: mesmaRaiz[0].id, candidatos: [] } : { id: '', candidatos: mesmaRaiz }
}

interface Props {
  cotacaoPropriaId: string
  fornecedores: Fornecedor[]
  // código → nome dos produtos pedidos, para mostrar o vínculo na prévia
  pedidos: Record<string, string>
  action: typeof salvarOrcamento
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const AMOSTRA = 12

export function AdicionarOrcamento({ cotacaoPropriaId, fornecedores, pedidos, action }: Props) {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [lido, setLido] = useState<(OrcamentoLido & { paginas: number }) | null>(null)
  const [fornecedorId, setFornecedorId] = useState('')
  const [candidatos, setCandidatos] = useState<Fornecedor[]>([])
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startTransition] = useTransition()

  async function ler(f: File) {
    setArquivo(f)
    setLido(null)
    setErro(null)
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
      const reconhecido = reconhecerFornecedor(fornecedores, r.cabecalho.cnpj)
      setFornecedorId(reconhecido.id)
      setCandidatos(reconhecido.candidatos)
      setLido(r)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProgresso(null)
    }
  }

  const resumo = useMemo(() => {
    if (!lido) return null
    const vinculados = lido.itens.filter((i) => i.codigo_pedido).length
    return {
      vinculados,
      fora: lido.itens.length - vinculados,
      produtos: new Set(lido.itens.flatMap((i) => (i.codigo_pedido ? [i.codigo_pedido] : []))).size,
      total: conferirTotal(lido.itens, lido.cabecalho.total_documento),
    }
  }, [lido])

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
          itens: lido.itens,
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
                {cab.cnpj && !fornecedorId && candidatos.length > 0 && (
                  <div className="ajuda">
                    CNPJ do orçamento: <span className="leitura">{cab.cnpj}</span>. Mesma empresa no cadastro:
                    <span className="mt-1 flex flex-wrap gap-1">
                      {candidatos.map((f) => (
                        <button key={f.id} type="button" onClick={() => setFornecedorId(f.id)} className="btn btn-secundario btn-sm h-7">
                          {nomeFornecedor(f)}
                          {f.codigo && <span className="leitura text-ardosia">{f.codigo}</span>}
                        </button>
                      ))}
                    </span>
                  </div>
                )}
                {cab.cnpj && !fornecedorId && candidatos.length === 0 && (
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

            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <span className="selo">{lido.itens.length} itens lidos</span>
              <span className="selo selo-ok">
                {resumo.vinculados} ligados a {resumo.produtos} produto(s) pedido(s)
              </span>
              {resumo.fora > 0 && <span className="selo">{resumo.fora} fora da cotação</span>}
              {resumo.total.bate === true && (
                <span className="selo selo-ok">soma bate com o total do documento ({moeda(cab.total_documento!)})</span>
              )}
            </div>
            {resumo.total.bate === false && (
              <p className="aviso aviso-atencao" role="status">
                A soma dos itens lidos ({moeda(resumo.total.soma)}, ou {moeda(resumo.total.somaComImpostos)} com impostos) não bate
                com o total do documento ({moeda(cab.total_documento!)}). Pode ter ficado item de fora: confira depois de salvar.
              </p>
            )}
          </div>

          <div className="overflow-x-auto border-t border-linha-2">
            <table className="tabela tabela-compacta whitespace-nowrap">
              <thead>
                <tr>
                  <th>Item do fornecedor</th>
                  <th>Embalagem</th>
                  <th className="num">Total</th>
                  <th className="num">Por unidade base</th>
                  <th>Produto pedido</th>
                </tr>
              </thead>
              <tbody>
                {lido.itens.slice(0, AMOSTRA).map((i, k) => {
                  const g = itemParaGravar(i)
                  const base = precoPorUnidadeBase(g.preco_unitario, g.quantidade_minima, g.unidade)
                  return (
                    <tr key={k}>
                      <td className="max-w-[260px] truncate" title={i.descricao}>
                        {i.descricao}
                      </td>
                      <td className="text-ardosia">
                        {i.quantidade_embalagens !== 1 && `${i.quantidade_embalagens}× `}
                        {i.embalagem_quantidade.toLocaleString('pt-BR')} {g.unidade}
                      </td>
                      <td className="num leitura">{moeda(i.valor_total)}</td>
                      <td className="num">
                        <LeituraPreco valor={base.valor} base={base.base} />
                      </td>
                      <td className="max-w-[260px] truncate" title={i.obs ?? undefined}>
                        {i.codigo_pedido ? pedidos[i.codigo_pedido] : <span className="text-ardosia-2">fora da cotação</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {lido.itens.length > AMOSTRA && (
            <p className="border-t border-linha-2 px-5 py-2.5 text-[12.5px] text-ardosia">e mais {lido.itens.length - AMOSTRA} item(ns)</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-linha-2 px-5 py-4">
            <button onClick={salvar} disabled={salvando} className="btn btn-primario">
              {salvando && <span className="girador" aria-hidden="true" />}
              {salvando ? 'Salvando…' : 'Salvar orçamento'}
            </button>
            <p className="text-[12.5px] text-ardosia">
              Os vínculos ficam como sugestão da leitura até você conferir no orçamento.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
