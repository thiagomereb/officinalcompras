'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, Paperclip, Sparkles, ArrowUpRight, FileText, FileDown } from 'lucide-react'
import { prepararExtracao } from '@/app/(dashboard)/cotacoes/actions'
import { concluirExtracao } from '@/lib/ocr-browser'
import { ehFalha } from '@/lib/acoes'
import { Vazio } from '@/components/ui/Vazio'

export type CotacaoRow = {
  id: string
  fornecedorNome: string
  data_cotacao: string
  validade_cotacao: string | null
  prazo_entrega_dias: number | null
  prazo_pagamento_dias: number | null
  frete_fixo: number | null
  status: string
  arquivo_nome: string | null
  signedUrl: string | null
  totalItens: number
}

const STATUS = {
  processando: { label: 'Aguardando itens', cls: '' },
  processado: { label: 'Itens lançados', cls: 'selo-ok' },
  erro: { label: 'Erro', cls: 'selo-alerta' },
} as const

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function CotacoesTable({ cotacoes }: { cotacoes: CotacaoRow[] }) {
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [progresso, setProgresso] = useState('')
  const [resultado, setResultado] = useState<{ resumo: string; falhas: string[] } | null>(null)

  // Filtrar não mexe na seleção — arquivos escolhidos continuam marcados
  // mesmo que saiam da lista visível ao digitar na busca.
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return cotacoes
    return cotacoes.filter(
      (c) =>
        c.fornecedorNome.toLowerCase().includes(termo) ||
        (c.arquivo_nome ?? '').toLowerCase().includes(termo),
    )
  }, [busca, cotacoes])

  const selecionaveisVisiveis = filtradas.filter((c) => c.signedUrl)
  const todasVisiveisSelecionadas =
    selecionaveisVisiveis.length > 0 && selecionaveisVisiveis.every((c) => selecionados.has(c.id))

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodasVisiveis() {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (todasVisiveisSelecionadas) {
        selecionaveisVisiveis.forEach((c) => next.delete(c.id))
      } else {
        selecionaveisVisiveis.forEach((c) => next.add(c.id))
      }
      return next
    })
  }

  // O loop roda no navegador (e não numa Server Action) porque cada OCR pode
  // levar minutos — uma Netlify Function estouraria o limite de 60s.
  // Cada cotação é reextraída do seu próprio arquivo, então os itens que ela já
  // tinha são substituídos (somar duplicaria tudo).
  function handleExtrairSelecionados() {
    const ids = [...selecionados]
    const comItens = cotacoes.filter((c) => selecionados.has(c.id) && c.totalItens > 0)
    if (
      comItens.length > 0 &&
      !confirm(`${comItens.length} das cotações selecionadas já têm itens, que serão substituídos pelos extraídos agora. Continuar?`)
    ) {
      return
    }

    setResultado(null)
    startTransition(async () => {
      let ok = 0
      const falhas: string[] = []

      for (const [i, id] of ids.entries()) {
        const nome = cotacoes.find((c) => c.id === id)?.fornecedorNome ?? id
        const etapa = `${i + 1} de ${ids.length}`
        setProgresso(`Extraindo ${etapa}...`)
        try {
          const preparo = await prepararExtracao(id, true)
          if (ehFalha(preparo)) throw new Error(preparo.erro)
          await concluirExtracao(id, preparo, {
            substituir: true,
            progresso: (msg) => setProgresso(`${etapa}: ${msg}`),
          })
          ok++
        } catch (err) {
          falhas.push(`${nome}: ${(err as Error).message}`)
        }
      }

      setProgresso('')
      setResultado({
        resumo:
          falhas.length === 0
            ? `${ok} cotação(ões) extraída(s) com sucesso!`
            : `${ok} extraída(s), ${falhas.length} com erro:`,
        falhas,
      })
      setSelecionados(new Set())
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por fornecedor ou arquivo"
            aria-label="Filtrar cotações"
            className="campo pl-8"
          />
        </div>

        {selecionados.size > 0 && (
          <div className="flex items-center gap-3 sm:ml-auto">
            <span className="text-[13px] text-ardosia">{selecionados.size} selecionada(s)</span>
            <button
              onClick={handleExtrairSelecionados}
              disabled={pending}
              className="btn btn-primario"
            >
              {pending ? <span className="girador" aria-hidden="true" /> : <Sparkles size={15} />}
              {pending ? progresso || 'Extraindo…' : 'Extrair com IA'}
            </button>
          </div>
        )}
      </div>

      {resultado && (
        <div className={`aviso mb-4 ${resultado.falhas.length ? 'aviso-erro' : 'aviso-ok'}`} role="status">
          <div>
            {resultado.resumo}
            {resultado.falhas.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {resultado.falhas.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {filtradas.length === 0 ? (
        <Vazio
          icone={FileText}
          titulo="Nenhuma cotação encontrada"
          texto={`Nenhum fornecedor ou arquivo corresponde a “${busca.trim()}”.`}
        />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={todasVisiveisSelecionadas}
                    onChange={toggleTodasVisiveis}
                    disabled={selecionaveisVisiveis.length === 0}
                    aria-label="Selecionar todas as cotações com arquivo"
                  />
                </th>
                <th>Fornecedor</th>
                <th>Data</th>
                <th>Validade</th>
                <th className="num">Itens</th>
                <th>Condições</th>
                <th>Situação</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => {
                const status = STATUS[c.status as keyof typeof STATUS] ?? STATUS.processando
                const condicoes = [
                  c.prazo_entrega_dias != null && `entrega ${c.prazo_entrega_dias} d`,
                  c.prazo_pagamento_dias != null && `pgto ${c.prazo_pagamento_dias} d`,
                  c.frete_fixo ? `frete R$ ${c.frete_fixo.toFixed(2).replace('.', ',')}` : null,
                ].filter(Boolean)

                return (
                  <tr key={c.id} className={selecionados.has(c.id) ? 'escolhido' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selecionados.has(c.id)}
                        onChange={() => toggle(c.id)}
                        disabled={!c.signedUrl}
                        title={c.signedUrl ? undefined : 'Sem arquivo anexado'}
                        aria-label={`Selecionar cotação de ${c.fornecedorNome}`}
                      />
                    </td>
                    <td className="font-medium">
                      <Link href={`/cotacoes/${c.id}`} className="hover:underline">
                        {c.fornecedorNome}
                      </Link>
                    </td>
                    <td className="num whitespace-nowrap text-ardosia">{formatDate(c.data_cotacao)}</td>
                    <td className="num whitespace-nowrap text-ardosia">{formatDate(c.validade_cotacao)}</td>
                    <td className="num">{c.totalItens}</td>
                    <td className="text-[12.5px] text-ardosia">
                      {condicoes.length ? condicoes.join(' · ') : <span className="text-ardosia-2">não informadas</span>}
                    </td>
                    <td>
                      <span className={`selo ${status.cls}`}>{status.label}</span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {c.signedUrl && (
                          <a
                            href={c.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-fantasma btn-icone btn-sm"
                            title={c.arquivo_nome ?? 'Arquivo'}
                            aria-label={`Abrir arquivo ${c.arquivo_nome ?? ''}`}
                          >
                            <Paperclip size={14} />
                          </a>
                        )}
                        <a
                          href={`/cotacoes/${c.id}/pdf`}
                          download
                          className="btn btn-fantasma btn-icone btn-sm"
                          title="Baixar PDF"
                          aria-label={`Baixar PDF da cotação de ${c.fornecedorNome}`}
                        >
                          <FileDown size={14} />
                        </a>
                        <Link
                          href={`/cotacoes/${c.id}`}
                          className="btn btn-fantasma btn-icone btn-sm"
                          title="Abrir cotação"
                          aria-label={`Abrir cotação de ${c.fornecedorNome}`}
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
