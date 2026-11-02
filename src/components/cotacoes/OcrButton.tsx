'use client'

import { useRef, useState, useTransition } from 'react'
import { Sparkles, Check, AlertCircle, Paperclip } from 'lucide-react'
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
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ARQUIVO_COTACAO}
        className="hidden"
        onChange={handleFileChange}
        disabled={pending}
      />
      {temArquivo && !pending && (
        <button
          onClick={handleAnexarNovo}
          title="Os itens do arquivo novo se somam aos que já existem"
          className="btn btn-secundario btn-sm"
        >
          <Paperclip size={14} />
          Anexar outro arquivo
        </button>
      )}

      <button onClick={handleExtrairClick} disabled={pending} className="btn btn-primario btn-sm">
        {pending ? <span className="girador" aria-hidden="true" /> : <Sparkles size={14} />}
        {pending ? (status || 'Processando…') : 'Extrair com IA'}
      </button>

      {result && (
        <span
          role="status"
          className={`inline-flex basis-full items-center gap-1.5 text-[13px] sm:basis-auto ${result.ok ? 'text-salvia' : 'text-oxido'}`}
        >
          {result.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          {result.msg}
        </span>
      )}
    </div>
  )
}
