'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Check, Link2 } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

type Item = {
  id: string
  descricao_original: string
  preco_unitario: number
  unidade: string | null
  quantidade_minima: number | null
}

type Insumo = { id: string; nome_padrao: string }

type VincularAction = (itemId: string, insumoId: string, cotacaoId: string) => Promise<Falha | void>

interface RowProps {
  item: Item
  insumos: Insumo[]
  cotacaoId: string
  action: VincularAction
  onAlterado: (itemId: string, vinculado: boolean) => void
}

function ItemRow({ item, insumos, cotacaoId, action, onAlterado }: RowProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [vinculadoNome, setVinculadoNome] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  const filtrados = query.trim().length >= 1
    ? insumos
        .filter(i => i.nome_padrao.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 12)
    : []

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selecionar(insumo: Insumo) {
    setOpen(false)
    setQuery(insumo.nome_padrao)
    setVinculadoNome(insumo.nome_padrao)
    setErro(null)
    onAlterado(item.id, true)
    startTransition(async () => {
      const resultado = await action(item.id, insumo.id, cotacaoId)
      if (resultado?.erro) {
        // Desfaz o otimismo da interface: o vínculo não foi gravado
        setVinculadoNome(null)
        setErro(resultado.erro)
        onAlterado(item.id, false)
      }
    })
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <tr className={`border-b border-gray-100 transition-colors ${vinculadoNome ? 'bg-green-50/60' : 'bg-white hover:bg-gray-50'}`}>
      <td className="px-4 py-3 text-sm text-gray-800 max-w-[260px]">
        <div className="truncate" title={item.descricao_original}>{item.descricao_original}</div>
      </td>
      <td className="px-4 py-3 text-sm text-right font-mono text-gray-700 whitespace-nowrap">
        {fmt(item.preco_unitario)}
        {item.unidade && <span className="text-gray-400 ml-1 text-xs">/{item.unidade}</span>}
        {item.quantidade_minima && (
          <div className="text-[11px] text-gray-400">emb. {item.quantidade_minima}{item.unidade ?? ''}</div>
        )}
      </td>
      <td className="px-4 py-3 w-80">
        {vinculadoNome ? (
          <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
            <Check size={14} className="shrink-0" />
            {vinculadoNome}
            {pending && <span className="text-xs text-green-500 font-normal">salvando…</span>}
          </div>
        ) : (
          <div className="relative" ref={containerRef}>
            <div className="relative">
              <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                placeholder="Buscar insumo…"
                onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => { if (query.trim()) setOpen(true) }}
                disabled={pending}
                className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </div>
            {open && filtrados.length > 0 && (
              <ul className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto text-sm">
                {filtrados.map(i => (
                  <li
                    key={i.id}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-gray-700"
                    onMouseDown={() => selecionar(i)}
                  >
                    {i.nome_padrao}
                  </li>
                ))}
              </ul>
            )}
            {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
            {open && query.trim().length >= 1 && filtrados.length === 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 px-3 py-2 text-sm text-gray-400">
                Nenhum insumo encontrado
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

interface Props {
  itens: Item[]
  insumos: Insumo[]
  cotacaoId: string
  action: VincularAction
}

export function VincularManualmente({ itens, insumos, cotacaoId, action }: Props) {
  const [filtroDesc, setFiltroDesc] = useState('')
  const [vinculadosLocal, setVinculadosLocal] = useState<Set<string>>(new Set())

  function onAlterado(itemId: string, vinculado: boolean) {
    setVinculadosLocal(prev => {
      const next = new Set(prev)
      if (vinculado) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  const itensFiltrados = filtroDesc.trim()
    ? itens.filter(i => i.descricao_original.toLowerCase().includes(filtroDesc.toLowerCase()))
    : itens

  const pendentes = itens.filter(i => !vinculadosLocal.has(i.id)).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">
          <span className="font-medium text-gray-900">{pendentes}</span> item(s) ainda sem vínculo
          {vinculadosLocal.size > 0 && (
            <span className="ml-2 text-green-600 font-medium">· {vinculadosLocal.size} vinculado(s) agora</span>
          )}
        </p>
        <input
          type="text"
          value={filtroDesc}
          onChange={e => setFiltroDesc(e.target.value)}
          placeholder="Filtrar por descrição…"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {itensFiltrados.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">Nenhum item corresponde ao filtro.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Descrição original</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Preço</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Vincular a</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  insumos={insumos}
                  cotacaoId={cotacaoId}
                  action={action}
                  onAlterado={onAlterado}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
