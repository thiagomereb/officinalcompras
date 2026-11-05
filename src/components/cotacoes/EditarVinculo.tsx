'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'
import type { alterarVinculo } from '@/app/(dashboard)/cotacoes/actions'

interface Props {
  itemId: string
  cotacaoId: string
  insumoNome: string | null
  action: typeof alterarVinculo
}

// Corrige o insumo de um item (vínculo automático errado) ou desfaz o vínculo
export function EditarVinculo({ itemId, cotacaoId, insumoNome, action }: Props) {
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function salvar(insumoId: string | null) {
    setErro(null)
    startTransition(async () => {
      const r = await action(itemId, insumoId, cotacaoId)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      setEditando(false)
      setAviso(
        r.mapasAfetados.length
          ? `A escolha deste item no rascunho "${r.mapasAfetados.join('", "')}" foi desfeita.`
          : null,
      )
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
              setAviso(null)
              setEditando(true)
            }}
            className="btn btn-fantasma btn-icone btn-sm h-6 w-6 opacity-40 group-hover/linha:opacity-100 focus-visible:opacity-100"
            title={insumoNome ? 'Trocar o insumo deste item' : 'Vincular a um insumo'}
            aria-label={insumoNome ? `Trocar o insumo ${insumoNome}` : 'Vincular a um insumo'}
          >
            <Pencil size={13} />
          </button>
        </div>
        {aviso && <p className="text-[11.5px] text-ardosia">{aviso}</p>}
      </div>
    )
  }

  return (
    <div className="w-72 space-y-1.5 py-0.5">
      <BuscaInsumo
        compacto
        autoFocus
        desabilitado={pending}
        onSelecionar={(insumo) => salvar(insumo.id)}
        placeholder={insumoNome ? 'Buscar o insumo certo…' : 'Buscar insumo…'}
      />
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
      {erro && <p className="text-[12px] whitespace-normal text-oxido">{erro}</p>}
    </div>
  )
}
