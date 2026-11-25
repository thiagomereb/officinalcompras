'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { Falha } from '@/lib/acoes'

type Unidade = { chave: string; nome: string }
type Codigo = { unidade: string; codigo: string }

interface Props {
  insumoId: string
  unidades: Unidade[]
  codigos: Codigo[]
  alterar: (insumoId: string, unidade: string, codigoAntigo: string | null, codigoNovo: string | null) => Promise<Falha | { linhas: number }>
}

// O que está sendo editado: um código existente ou um novo numa unidade
type Edicao = { unidade: string; antigo: string | null }

// Os códigos do insumo no sistema da farmácia, um por unidade: o mesmo número
// pode ser outro produto na outra unidade
export function CodigosInsumo({ insumoId, unidades, codigos, alterar }: Props) {
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function editar(e: Edicao) {
    setEditando(e)
    setValor(e.antigo ?? '')
    setErro(null)
    setAviso(null)
  }

  function salvar(novo: string | null) {
    if (!editando) return
    const { unidade, antigo } = editando
    if (novo != null && !/^\d{1,15}$/.test(novo)) {
      setErro('O código tem só números (até 15).')
      return
    }
    setErro(null)
    startTransition(async () => {
      const r = await alterar(insumoId, unidade, antigo, novo)
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

  const formulario = (
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
        aria-label="Código"
        className="campo campo-sm leitura w-32"
      />
      <button type="button" onClick={() => salvar(valor || null)} disabled={pending || !valor} className="btn btn-primario btn-sm">
        {pending && <span className="girador" aria-hidden="true" />}
        Salvar
      </button>
      {editando?.antigo && (
        <button type="button" onClick={() => salvar(null)} disabled={pending} className="btn btn-fantasma btn-sm text-oxido">
          Tirar
        </button>
      )}
      <button type="button" onClick={() => setEditando(null)} disabled={pending} className="btn btn-fantasma btn-sm">
        Cancelar
      </button>
    </div>
  )

  return (
    <section className="painel">
      <div className="painel-topo">
        <div>
          <h2 className="painel-titulo">Códigos no sistema da farmácia</h2>
          <p className="text-[12.5px] text-ardosia">
            Um por unidade: o mesmo número pode ser outro produto na outra unidade. É por ele que a importação da cotação
            reconhece o insumo.
          </p>
        </div>
      </div>
      <ul>
        {unidades.map((u) => {
          const daUnidade = codigos.filter((c) => c.unidade === u.chave)
          const novoAqui = editando?.unidade === u.chave && editando.antigo == null
          return (
            <li key={u.chave} className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-linha-2 px-5 py-3 last:border-0">
              <span className="w-24 shrink-0 pt-1 text-[13px] font-medium">{u.nome}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {daUnidade.map((c) =>
                  editando?.unidade === u.chave && editando.antigo === c.codigo ? (
                    <div key={c.codigo}>{formulario}</div>
                  ) : (
                    <div key={c.codigo} className="flex items-center gap-2">
                      <span className="leitura text-[14px]">{c.codigo}</span>
                      <button
                        type="button"
                        onClick={() => editar({ unidade: u.chave, antigo: c.codigo })}
                        disabled={pending}
                        className="btn btn-fantasma btn-icone btn-sm h-7 w-7"
                        title="Editar o código"
                        aria-label={`Editar o código ${c.codigo} da unidade ${u.nome}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  ),
                )}
                {novoAqui ? (
                  formulario
                ) : daUnidade.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-ardosia-2">sem código</span>
                    <button
                      type="button"
                      onClick={() => editar({ unidade: u.chave, antigo: null })}
                      disabled={pending}
                      className="btn btn-secundario btn-sm"
                    >
                      <Plus size={13} />
                      Adicionar
                    </button>
                  </div>
                ) : null}
              </div>
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
