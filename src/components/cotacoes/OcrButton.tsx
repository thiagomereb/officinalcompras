'use client'

import { useRef, useState, useTransition } from 'react'
import { Sparkles, CheckCircle, AlertCircle, Loader2, Paperclip } from 'lucide-react'
import { prepararExtracao, anexarArquivo } from '@/app/(dashboard)/cotacoes/actions'
import { concluirExtracao } from '@/lib/ocr-browser'
import { enviarArquivoCotacao, ACCEPT_ARQUIVO_COTACAO } from '@/lib/supabase/upload'
import { ehFalha } from '@/lib/acoes'

interface Props {
  cotacaoId: string
  temArquivo: boolean
  totalItens: number
}

export function OcrButton({ cotacaoId, temArquivo, totalItens }: Props) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExtrairClick() {
    if (temArquivo) {
      handleReextrair()
    } else {
      fileInputRef.current?.click()
    }
  }

  function handleAnexarNovo() {
    fileInputRef.current?.click()
  }

  // Reextrair lê de novo o mesmo arquivo, então substitui os itens atuais em
  // vez de somar duplicatas.
  function handleReextrair() {
    if (
      totalItens > 0 &&
      !confirm(`Extrair novamente substitui os ${totalItens} itens atuais desta cotação. Continuar?`)
    ) {
      return
    }
    setResult(null)
    setStatus('Extraindo com IA...')
    startTransition(async () => {
      try {
        const preparo = await prepararExtracao(cotacaoId, true)
        if (ehFalha(preparo)) throw new Error(preparo.erro)
        const count = await concluirExtracao(cotacaoId, preparo, { substituir: true, progresso: setStatus })
        setResult({ ok: true, msg: `${count} item(s) extraído(s) com sucesso!` })
      } catch (err) {
        setResult({ ok: false, msg: (err as Error).message })
      } finally {
        setStatus('')
      }
    })
  }

  // Um arquivo novo traz itens novos: eles se somam aos que já existem.
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    startTransition(async () => {
      try {
        setStatus('Enviando arquivo...')
        const path = await enviarArquivoCotacao(file, file.name)
        const preparo = await anexarArquivo(cotacaoId, path, file.name)
        if (ehFalha(preparo)) throw new Error(preparo.erro)

        setStatus('Extraindo com IA...')
        const count = await concluirExtracao(cotacaoId, preparo, { substituir: false, progresso: setStatus })
        setResult({ ok: true, msg: `${count} item(s) extraído(s) com sucesso!` })
      } catch (err) {
        setResult({ ok: false, msg: (err as Error).message })
      } finally {
        setStatus('')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ARQUIVO_COTACAO}
        className="hidden"
        onChange={handleFileChange}
        disabled={pending}
      />
      <button
        onClick={handleExtrairClick}
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {pending ? (status || 'Processando...') : 'Extrair com IA'}
      </button>

      {temArquivo && !pending && (
        <button
          onClick={handleAnexarNovo}
          title="Anexar outro arquivo a esta cotação"
          className="inline-flex items-center gap-2 px-3 py-2 text-violet-700 border border-violet-300 bg-violet-50 text-sm font-medium rounded-lg hover:bg-violet-100 transition-colors"
        >
          <Paperclip size={14} />
          Anexar outro arquivo
        </button>
      )}

      {result && (
        <span className={`inline-flex items-center gap-1.5 text-sm ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {result.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {result.msg}
        </span>
      )}
    </div>
  )
}
