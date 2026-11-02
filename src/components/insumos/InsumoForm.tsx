'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { SinonimosEditor } from './SinonimosEditor'
import type { Tables } from '@/types/database'
import type { Falha } from '@/lib/acoes'

type Insumo = Tables<'insumos'>
type Sinonimo = Tables<'insumo_sinonimos'>

const UNIDADES = ['g', 'kg', 'mg', 'mcg', 'mL', 'L', 'UI', 'un', 'cáps', 'comp']

interface Props {
  insumo?: Insumo
  sinonimos?: Sinonimo[]
  action: (formData: FormData) => Promise<Falha | void>
}

export function InsumoForm({ insumo, sinonimos = [], action }: Props) {
  const [error, formAction, pending] = useActionState(
    async (_: string | null, formData: FormData) => {
      try {
        const resultado = await action(formData)
        return resultado?.erro ?? null
      } catch (e) {
        return (e as Error).message
      }
    },
    null
  )

  return (
    <form action={formAction} className="space-y-6">
      {error && (
        <p className="aviso aviso-erro" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="i-nome" className="legenda">
            Nome padrão <span className="obrigatorio">*</span>
          </label>
          <input
            id="i-nome"
            name="nome_padrao"
            required
            defaultValue={insumo?.nome_padrao}
            className="campo"
            placeholder="Ácido Ascórbico"
          />
          <p className="ajuda">O nome oficial, usado em todo o sistema.</p>
        </div>

        <div>
          <label htmlFor="i-cas" className="legenda">Número CAS</label>
          <input
            id="i-cas"
            name="cas_number"
            defaultValue={insumo?.cas_number ?? ''}
            className="campo leitura"
            placeholder="50-81-7"
          />
          <p className="ajuda">Identifica a substância e evita cadastro duplicado.</p>
        </div>

        <div>
          <label htmlFor="i-unidade" className="legenda">
            Unidade padrão <span className="obrigatorio">*</span>
          </label>
          <select
            id="i-unidade"
            name="unidade_padrao"
            defaultValue={insumo?.unidade_padrao ?? 'g'}
            className="campo"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="i-descricao" className="legenda">Observações</label>
          <textarea
            id="i-descricao"
            name="descricao"
            defaultValue={insumo?.descricao ?? ''}
            rows={2}
            className="campo"
            placeholder="Forma, pureza, cuidados de armazenamento…"
          />
        </div>

        <div className="sm:col-span-2">
          <span className="legenda">Sinônimos</span>
          <SinonimosEditor inicial={sinonimos.map((s) => s.sinonimo)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn btn-primario">
          {pending && <span className="girador" aria-hidden="true" />}
          {pending ? 'Salvando…' : insumo ? 'Salvar alterações' : 'Cadastrar insumo'}
        </button>
        <Link href="/insumos" className="btn btn-secundario">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
