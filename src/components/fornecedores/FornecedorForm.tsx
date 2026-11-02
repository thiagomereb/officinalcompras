'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Tables } from '@/types/database'
import type { Falha } from '@/lib/acoes'

type Fornecedor = Tables<'fornecedores'>

interface Props {
  fornecedor?: Fornecedor
  action: (formData: FormData) => Promise<Falha | void>
}

function formatarCNPJ(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18)
}

function formatarTelefone(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15)
}

export function FornecedorForm({ fornecedor, action }: Props) {
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
          <label htmlFor="f-razao" className="legenda">
            Razão social <span className="obrigatorio">*</span>
          </label>
          <input
            id="f-razao"
            name="razao_social"
            required
            defaultValue={fornecedor?.razao_social}
            className="campo"
            placeholder="Nome jurídico completo"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="f-fantasia" className="legenda">Nome fantasia</label>
          <input
            id="f-fantasia"
            name="nome_fantasia"
            defaultValue={fornecedor?.nome_fantasia ?? ''}
            className="campo"
            placeholder="Como o fornecedor é conhecido"
          />
          <p className="ajuda">É o nome que aparece nas cotações e nos mapas.</p>
        </div>

        <div>
          <label htmlFor="f-cnpj" className="legenda">CNPJ</label>
          <input
            id="f-cnpj"
            name="cnpj"
            inputMode="numeric"
            defaultValue={fornecedor?.cnpj ?? ''}
            className="campo leitura"
            placeholder="00.000.000/0000-00"
            onChange={(e) => { e.target.value = formatarCNPJ(e.target.value) }}
          />
        </div>

        <div>
          <label htmlFor="f-telefone" className="legenda">Telefone</label>
          <input
            id="f-telefone"
            name="telefone"
            inputMode="tel"
            defaultValue={fornecedor?.telefone ?? ''}
            className="campo leitura"
            placeholder="(00) 00000-0000"
            onChange={(e) => { e.target.value = formatarTelefone(e.target.value) }}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="f-email" className="legenda">E-mail</label>
          <input
            id="f-email"
            name="email"
            type="email"
            defaultValue={fornecedor?.email ?? ''}
            className="campo"
            placeholder="contato@fornecedor.com.br"
          />
        </div>

        {fornecedor && (
          <div className="sm:col-span-2">
            {/* O hidden garante que "desmarcado" também chegue à action */}
            <input type="hidden" name="ativo" value="false" />
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="ativo"
                value="true"
                defaultChecked={fornecedor.ativo ?? true}
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13.5px] font-medium">Fornecedor ativo</span>
                <span className="block text-[12.5px] text-ardosia">
                  Inativo some da lista de novas cotações, mas o histórico dele continua.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn btn-primario">
          {pending && <span className="girador" aria-hidden="true" />}
          {pending ? 'Salvando…' : fornecedor ? 'Salvar alterações' : 'Cadastrar fornecedor'}
        </button>
        <Link href="/fornecedores" className="btn btn-secundario">
          Cancelar
        </Link>
      </div>
    </form>
  )
}
