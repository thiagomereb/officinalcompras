'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import { salvarConfiguracao } from '@/app/(dashboard)/configuracoes/actions'

export function ApiKeyForm({ valorAtual }: { valorAtual: string | null }) {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(valorAtual ?? '')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const masked = valorAtual ? `sk-...${valorAtual.slice(-6)}` : ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setResult(null)
    startTransition(async () => {
      try {
        await salvarConfiguracao('openai_api_key', value.trim())
        setResult({ ok: true, msg: 'Chave salva com sucesso!' })
        setValue(value.trim())
      } catch (err) {
        setResult({ ok: false, msg: (err as Error).message })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {valorAtual && (
        <p className="text-xs text-slate-500">
          Chave atual: <span className="font-mono">{masked}</span>
        </p>
      )}

      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Salvando...' : 'Salvar chave'}
        </button>

        {result && (
          <span className={`inline-flex items-center gap-1.5 text-sm ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {result.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {result.msg}
          </span>
        )}
      </div>
    </form>
  )
}
