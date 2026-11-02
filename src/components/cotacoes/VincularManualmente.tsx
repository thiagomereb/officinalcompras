'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import type { Falha } from '@/lib/acoes'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'
import type { InsumoOpcao } from '@/lib/supabase/busca-insumos'

type Item = {
  id: string
  descricao_original: string
  preco_unitario: number
  unidade: string | null
  quantidade_minima: number | null
}

type VincularAction = (itemId: string, insumoId: string, cotacaoId: string) => Promise<Falha | void>

interface RowProps {
  item: Item
  cotacaoId: string
  action: VincularAction
  onAlterado: (itemId: string, vinculado: boolean) => void
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function ItemRow({ item, cotacaoId, action, onAlterado }: RowProps) {
  const [vinculadoNome, setVinculadoNome] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function selecionar(insumo: InsumoOpcao) {
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

  return (
    <tr className={vinculadoNome ? 'escolhido' : undefined}>
      <td className="max-w-[300px]">
        <div className="truncate" title={item.descricao_original}>
          {item.descricao_original}
        </div>
      </td>
      <td className="num whitespace-nowrap">
        <span className="leitura">{moeda(item.preco_unitario)}</span>
        {item.quantidade_minima != null && (
          <div className="text-[11.5px] text-ardosia">
            emb. {item.quantidade_minima} {item.unidade ?? ''}
          </div>
        )}
      </td>
      <td className="w-[min(380px,50vw)]">
        {vinculadoNome ? (
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-salvia">
            <Check size={14} className="shrink-0" />
            {vinculadoNome}
            {pending && <span className="text-[12px] font-normal text-ardosia">salvando…</span>}
          </div>
        ) : (
          <>
            <BuscaInsumo compacto onSelecionar={selecionar} placeholder="Buscar insumo…" />
            {erro && <p className="mt-1 text-[12px] text-oxido">{erro}</p>}
          </>
        )}
      </td>
    </tr>
  )
}

interface Props {
  itens: Item[]
  cotacaoId: string
  action: VincularAction
}

export function VincularManualmente({ itens, cotacaoId, action }: Props) {
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

  const termo = filtroDesc.trim().toLowerCase()
  const itensFiltrados = termo
    ? itens.filter(i => i.descricao_original.toLowerCase().includes(termo))
    : itens

  const pendentes = itens.filter(i => !vinculadosLocal.has(i.id)).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha-2 px-4 py-3">
        <p className="text-[13px] text-ardosia">
          <span className="font-medium text-grafite">{pendentes}</span> item(ns) sem insumo
          {vinculadosLocal.size > 0 && (
            <span className="ml-2 text-salvia">· {vinculadosLocal.size} vinculado(s) agora</span>
          )}
        </p>
        <input
          type="text"
          value={filtroDesc}
          onChange={e => setFiltroDesc(e.target.value)}
          placeholder="Filtrar por descrição"
          aria-label="Filtrar itens por descrição"
          className="campo campo-sm w-full sm:w-64"
        />
      </div>

      {itensFiltrados.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ardosia">Nenhum item corresponde ao filtro.</p>
      ) : (
        // Sem overflow aqui: a lista de sugestões da busca precisa vazar da tabela
        <table className="tabela">
          <thead>
            <tr>
              <th>Descrição no arquivo</th>
              <th className="num">Preço</th>
              <th>Vincular ao insumo</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                cotacaoId={cotacaoId}
                action={action}
                onAlterado={onAlterado}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
