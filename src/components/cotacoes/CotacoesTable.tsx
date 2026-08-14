'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, Pencil, Clock, CheckCircle, AlertCircle, Paperclip, Sparkles, Loader2, FileText } from 'lucide-react'
import { prepararExtracao } from '@/app/(dashboard)/cotacoes/actions'
import { concluirExtracao } from '@/lib/ocr-browser'

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

const STATUS_CONFIG = {
  processando: { label: 'Aguardando itens', icon: Clock, cls: 'bg-yellow-50 text-yellow-700' },
  processado: { label: 'Itens lançados', icon: CheckCircle, cls: 'bg-green-50 text-green-700' },
  erro: { label: 'Erro', icon: AlertCircle, cls: 'bg-red-50 text-red-700' },
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
  const [resultado, setResultado] = useState<string | null>(null)

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
  function handleExtrairSelecionados() {
    setResultado(null)
    const ids = [...selecionados]
    startTransition(async () => {
      let ok = 0
      let falhas = 0

      for (const [i, id] of ids.entries()) {
        setProgresso(`Extraindo ${i + 1} de ${ids.length}...`)
        try {
          const preparo = await prepararExtracao(id)
          await concluirExtracao(id, preparo)
          ok++
        } catch {
          falhas++
        }
      }

      setProgresso('')
      setResultado(
        falhas === 0
          ? `${ok} cotação(ões) extraída(s) com sucesso!`
          : `${ok} extraída(s), ${falhas} com erro.`,
      )
      setSelecionados(new Set())
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor ou arquivo..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {selecionados.size > 0 && (
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-gray-500">{selecionados.size} selecionado(s)</span>
            <button
              onClick={handleExtrairSelecionados}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {pending ? progresso || 'Extraindo...' : 'Extrair com IA'}
            </button>
          </div>
        )}
      </div>

      {resultado && (
        <div className="mb-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
          {resultado}
        </div>
      )}

      {filtradas.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">Nenhuma cotação encontrada</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todasVisiveisSelecionadas}
                    onChange={toggleTodasVisiveis}
                    disabled={selecionaveisVisiveis.length === 0}
                    title="Selecionar todos os arquivos visíveis"
                  />
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fornecedor</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Validade</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Itens</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Condições</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map((c) => {
                const status = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.processando
                const StatusIcon = status.icon

                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selecionados.has(c.id)}
                        onChange={() => toggle(c.id)}
                        disabled={!c.signedUrl}
                        title={c.signedUrl ? undefined : 'Sem arquivo anexado'}
                      />
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{c.fornecedorNome}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(c.data_cotacao)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(c.validade_cotacao)}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-700">{c.totalItens}</span>
                      <span className="text-gray-400 ml-1">item(s)</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {c.prazo_entrega_dias && <div>Entrega: {c.prazo_entrega_dias}d</div>}
                        {c.prazo_pagamento_dias && <div>Pgto: {c.prazo_pagamento_dias}d</div>}
                        {c.frete_fixo && <div>Frete: R$ {c.frete_fixo.toFixed(2)}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                        <StatusIcon size={11} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {c.signedUrl && (
                          <a
                            href={c.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title={c.arquivo_nome ?? 'Arquivo'}
                          >
                            <Paperclip size={14} />
                          </a>
                        )}
                        <Link
                          href={`/cotacoes/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-xs"
                        >
                          <Pencil size={13} />
                          Abrir
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
