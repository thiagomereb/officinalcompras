'use client'

import { useRef, useState, useTransition } from 'react'
import { Sparkles, CheckCircle, AlertCircle, Loader2, Upload } from 'lucide-react'
import { extrairComOCR, uploadEExtrair } from '@/app/(dashboard)/cotacoes/actions'

interface Props {
  cotacaoId: string
  temArquivo: boolean
}

async function pdfParaImagens(file: File): Promise<File[]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const imagens: File[] = []
  const baseName = file.name.replace(/\.pdf$/i, '')

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page as any).render({ canvasContext: canvas.getContext('2d')!, viewport }).promise

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    )
    imagens.push(new File([blob], `${baseName}_p${i}.png`, { type: 'image/png' }))
  }

  return imagens
}

export function OcrButton({ cotacaoId, temArquivo }: Props) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleReextrair() {
    setResult(null)
    setStatus('')
    startTransition(async () => {
      try {
        const { count } = await extrairComOCR(cotacaoId)
        setResult({ ok: true, msg: `${count} item(s) extraído(s) com sucesso!` })
      } catch (err) {
        setResult({ ok: false, msg: (err as Error).message })
      }
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    startTransition(async () => {
      try {
        const isPdf = file.name.toLowerCase().endsWith('.pdf')
        let arquivos: File[]

        if (isPdf) {
          setStatus('Convertendo PDF...')
          arquivos = await pdfParaImagens(file)
          setStatus(`Extraindo ${arquivos.length} página(s) com IA...`)
        } else {
          arquivos = [file]
          setStatus('Extraindo com IA...')
        }

        let total = 0
        for (const img of arquivos) {
          const formData = new FormData()
          formData.append('arquivo', img)
          const { count } = await uploadEExtrair(cotacaoId, formData)
          total += count
        }

        setResult({ ok: true, msg: `${total} item(s) extraído(s) com sucesso!` })
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
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={pending}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {pending ? (status || 'Processando...') : 'Enviar arquivo e extrair com IA'}
      </button>

      {temArquivo && !pending && (
        <button
          onClick={handleReextrair}
          className="inline-flex items-center gap-2 px-3 py-2 text-violet-700 border border-violet-300 bg-violet-50 text-sm font-medium rounded-lg hover:bg-violet-100 transition-colors"
        >
          <Sparkles size={14} />
          Re-extrair arquivo atual
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
