'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { Falha } from '@/lib/acoes'
import { UNIDADES_FARMACIA, codigoNaUnidade, type CodigosInsumo as Codigos, type UnidadeFarmacia } from '@/lib/unidades-farmacia'

interface Props {
  insumoId: string
  codigos: Codigos
  // A unidade do login: só o código dela aparece; null mostra as duas
  unidadeLogin: UnidadeFarmacia | null
  alterar: (insumoId: string, unidade: string, codigoNovo: string | null) => Promise<Falha | { linhas: number }>
}

// O código do insumo no sistema da farmácia, um campo por unidade: o mesmo
// número pode ser outro produto na outra unidade
export function CodigosInsumo({ insumoId, codigos, unidadeLogin, alterar }: Props) {
  const [editando, setEditando] = useState<UnidadeFarmacia | null>(null)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const unidades = UNIDADES_FARMACIA.filter((u) => !unidadeLogin || u.id === unidadeLogin)

  function editar(u: UnidadeFarmacia) {
    setEditando(u)
    setValor(codigoNaUnidade(codigos, u) ?? '')
    setErro(null)
    setAviso(null)
  }

  function salvar(novo: string | null) {
    if (!editando) return
    if (novo != null && !/^\d{1,15}$/.test(novo)) {
      setErro('O código tem só números (até 15).')
      return
    }
    setErro(null)
    const unidade = editando
    startTransition(async () => {
      const r = await alterar(insumoId, unidade, novo)
      if ('erro' in r) {
        setErro(r.erro)
        return
      }
      setEditando(null)
      setAviso(
        r.linhas > 0
          ? `Salvo. ${r.linhas} linha(s) incluída(s) à mão em cotação aberta desta unidade passaram a usar o código.`
          : novo == null
            ? 'Código tirado.'
            : 'Salvo.',
      )
    })
  }

  return (
    <section className="painel">
      <div className="painel-topo">
        <div>
          <h2 className="painel-titulo">{unidadeLogin ? 'Código no sistema da farmácia' : 'Códigos no sistema da farmácia'}</h2>
          <p className="text-[12.5px] text-ardosia">
            {unidadeLogin
              ? 'O código deste insumo na sua unidade. É por ele que a importação da cotação reconhece o insumo.'
              : 'Um por unidade: o mesmo número pode ser outro produto na outra unidade. É por ele que a importação da cotação reconhece o insumo.'}
          </p>
        </div>
      </div>
      <ul>
        {unidades.map((u) => {
          const codigo = codigoNaUnidade(codigos, u.id)
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-linha-2 px-5 py-3 last:border-0">
              <span className="w-24 shrink-0 text-[13px] font-medium">
                {u.nome}
                <span className="block text-[11.5px] font-normal text-ardosia">{u.loja}</span>
              </span>
              {editando === u.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvar(valor || null)
                      if (e.key === 'Escape') setEditando(null)
                    }}
                    inputMode="numeric"
                    maxLength={15}
                    autoFocus
                    aria-label={`Código em ${u.nome}`}
                    className="campo campo-sm leitura w-32"
                  />
                  <button type="button" onClick={() => salvar(valor || null)} disabled={pending || !valor} className="btn btn-primario btn-sm">
                    {pending && <span className="girador" aria-hidden="true" />}
                    Salvar
                  </button>
                  {codigo && (
                    <button type="button" onClick={() => salvar(null)} disabled={pending} className="btn btn-fantasma btn-sm text-oxido">
                      Tirar
                    </button>
                  )}
                  <button type="button" onClick={() => setEditando(null)} disabled={pending} className="btn btn-fantasma btn-sm">
                    Cancelar
                  </button>
                </div>
              ) : codigo ? (
                <div className="flex items-center gap-2">
                  <span className="leitura text-[14px]">{codigo}</span>
                  <button
                    type="button"
                    onClick={() => editar(u.id)}
                    disabled={pending}
                    className="btn btn-fantasma btn-icone btn-sm h-7 w-7"
                    title="Editar o código"
                    aria-label={`Editar o código em ${u.nome}`}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-ardosia-2">sem código</span>
                  <button type="button" onClick={() => editar(u.id)} disabled={pending} className="btn btn-secundario btn-sm">
                    <Plus size={13} />
                    Adicionar
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {(erro || aviso) && (
        <p className={`aviso ${erro ? 'aviso-erro' : 'aviso-ok'} mx-5 mb-4`} role={erro ? 'alert' : 'status'}>
          {erro ?? aviso}
        </p>
      )}
    </section>
  )
}
