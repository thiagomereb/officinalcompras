'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'
import type { alterarVinculo, Aprendizado } from '@/app/(dashboard)/cotacoes/actions'

interface Props {
  itemId: string
  cotacaoId: string
  insumoNome: string | null
  action: typeof alterarVinculo
}

function textoAprendizado(a: Aprendizado, insumoNome: string) {
  const removido = a.removidoDe.length ? ` (deixou de apontar para ${a.removidoDe.join(', ')})` : ''
  return `Nas próximas cotações, “${a.sinonimo}” já entra como ${insumoNome}${removido}.`
}

// Corrige o insumo de um item (vínculo automático errado) ou desfaz o vínculo
export function EditarVinculo({ itemId, cotacaoId, insumoNome, action }: Props) {
  const [editando, setEditando] = useState(false)
  // Na correção, a descrição do fornecedor vira sinônimo do insumo certo, para
  // o vínculo automático não errar de novo
  const [lembrar, setLembrar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function salvar(insumoId: string | null, nomeEscolhido?: string) {
    setErro(null)
    startTransition(async () => {
      const r = await action(itemId, insumoId, cotacaoId, lembrar && !!insumoId)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      setEditando(false)
      setAvisos([
        ...(r.aprendizado && nomeEscolhido ? [textoAprendizado(r.aprendizado, nomeEscolhido)] : []),
        ...(r.mapasAfetados.length
          ? [`A escolha deste item no rascunho "${r.mapasAfetados.join('", "')}" foi desfeita.`]
          : []),
      ])
    })
  }

  if (!editando) {
    return (
      <div>
        <div className="flex items-center gap-1">
          {insumoNome ? (
            <span className="font-medium">{insumoNome}</span>
          ) : (
            <span className="text-ardosia-2">sem vínculo</span>
          )}
          <button
            onClick={() => {
              setAvisos([])
              setEditando(true)
            }}
            className="btn btn-fantasma btn-icone btn-sm h-6 w-6 opacity-40 group-hover/linha:opacity-100 focus-visible:opacity-100"
            title={insumoNome ? 'Trocar o insumo deste item' : 'Vincular a um insumo'}
            aria-label={insumoNome ? `Trocar o insumo ${insumoNome}` : 'Vincular a um insumo'}
          >
            <Pencil size={13} />
          </button>
        </div>
        {avisos.map((a) => (
          <p key={a} className="max-w-xs whitespace-normal text-[11.5px] text-ardosia">
            {a}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="w-72 space-y-1.5 py-0.5 whitespace-normal">
      <BuscaInsumo
        compacto
        autoFocus
        desabilitado={pending}
        onSelecionar={(insumo) => salvar(insumo.id, insumo.nome_padrao)}
        placeholder={insumoNome ? 'Buscar o insumo certo…' : 'Buscar insumo…'}
      />
      <label className="flex cursor-pointer items-start gap-2 text-[12px] text-ardosia">
        <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="mt-px h-3.5 w-3.5" />
        Usar este vínculo nas próximas cotações
      </label>
      <div className="flex items-center gap-1">
        {insumoNome && (
          <button onClick={() => salvar(null)} disabled={pending} className="btn btn-fantasma btn-sm hover:text-oxido">
            Desvincular
          </button>
        )}
        <button onClick={() => setEditando(false)} disabled={pending} className="btn btn-fantasma btn-sm">
          Cancelar
        </button>
        {pending && <span className="girador text-ardosia" aria-label="Salvando" />}
      </div>
      {erro && <p className="text-[12px] text-oxido">{erro}</p>}
    </div>
  )
}
