'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { Tables } from '@/types/database'
import type { Falha } from '@/lib/acoes'
import { enviarArquivoCotacao, removerArquivoCotacao, ACCEPT_ARQUIVO_COTACAO } from '@/lib/supabase/upload'

type Fornecedor = Tables<'fornecedores'>
type Cotacao = Tables<'cotacoes'>

interface Props {
  fornecedores: Fornecedor[]
  cotacao?: Cotacao
  action: (formData: FormData) => Promise<Falha | void>
}

type Estado = { erro: string | null; salvo: boolean }

export function CotacaoForm({ fornecedores, cotacao, action }: Props) {
  const [estado, formAction, pending] = useActionState(
    async (_: Estado, formData: FormData): Promise<Estado> => {
      try {
        // O arquivo sobe direto do navegador para o storage; a action recebe
        // só o path (ver enviarArquivoCotacao).
        const arquivo = formData.get('arquivo')
        formData.delete('arquivo')
        let enviado: string | null = null
        if (arquivo instanceof File && arquivo.size > 0) {
          enviado = await enviarArquivoCotacao(arquivo, arquivo.name)
          formData.set('arquivo_path', enviado)
          formData.set('arquivo_nome', arquivo.name)
        }

        const resultado = await action(formData)
        if (resultado?.erro) {
          if (enviado) await removerArquivoCotacao(enviado)
          return { erro: resultado.erro, salvo: false }
        }
        return { erro: null, salvo: true }
      } catch (e) {
        return { erro: (e as Error).message, salvo: false }
      }
    },
    { erro: null, salvo: false }
  )

  const hoje = new Date().toISOString().split('T')[0]

  // Os ids dos campos precisam ser únicos: na página da cotação este form
  // convive com o de adicionar item
  const id = (campo: string) => `cotacao-${cotacao?.id ?? 'nova'}-${campo}`

  return (
    <form action={formAction} className="space-y-6">
      {estado.erro && (
        <p className="aviso aviso-erro" role="alert">
          {estado.erro}
        </p>
      )}
      {cotacao && estado.salvo && !pending && (
        <p className="aviso aviso-ok" role="status">
          Condições salvas.
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={id('fornecedor')} className="legenda">
            Fornecedor <span className="obrigatorio">*</span>
          </label>
          <select
            id={id('fornecedor')}
            name="fornecedor_id"
            required
            defaultValue={cotacao?.fornecedor_id ?? ''}
            className="campo"
          >
            <option value="">Selecione um fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia ?? f.razao_social}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={id('data')} className="legenda">
            Data da cotação <span className="obrigatorio">*</span>
          </label>
          <input
            id={id('data')}
            type="date"
            name="data_cotacao"
            required
            defaultValue={cotacao?.data_cotacao ?? hoje}
            className="campo"
          />
        </div>

        <div>
          <label htmlFor={id('validade')} className="legenda">Validade da cotação</label>
          <input
            id={id('validade')}
            type="date"
            name="validade_cotacao"
            defaultValue={cotacao?.validade_cotacao ?? ''}
            className="campo"
          />
        </div>
      </div>

      <fieldset className="border-t border-linha-2 pt-5">
        <legend className="rotulo pr-3">Condições comerciais</legend>
        <p className="mb-4 mt-1 text-[12.5px] text-ardosia">
          Entram no score do mapa de cotação. Campo vazio fica neutro na comparação.
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          <div>
            <label htmlFor={id('entrega')} className="legenda">Prazo de entrega (dias)</label>
            <input
              id={id('entrega')}
              type="number"
              name="prazo_entrega_dias"
              min="0"
              step="1"
              placeholder="7"
              defaultValue={cotacao?.prazo_entrega_dias ?? ''}
              className="campo"
            />
          </div>

          <div>
            <label htmlFor={id('pagamento')} className="legenda">Prazo de pagamento (dias)</label>
            <input
              id={id('pagamento')}
              type="number"
              name="prazo_pagamento_dias"
              min="0"
              step="1"
              placeholder="30"
              defaultValue={cotacao?.prazo_pagamento_dias ?? ''}
              className="campo"
            />
          </div>

          <div>
            <label htmlFor={id('frete')} className="legenda">Frete fixo (R$)</label>
            <input
              id={id('frete')}
              type="number"
              name="frete_fixo"
              min="0"
              step="0.01"
              placeholder="0,00"
              defaultValue={cotacao?.frete_fixo ?? ''}
              className="campo"
            />
            <p className="ajuda">Deixe vazio se o frete for grátis.</p>
          </div>

          <div>
            <label htmlFor={id('frete-gratis')} className="legenda">Frete grátis acima de (R$)</label>
            <input
              id={id('frete-gratis')}
              type="number"
              name="frete_gratis_acima"
              min="0"
              step="0.01"
              placeholder="0,00"
              defaultValue={cotacao?.frete_gratis_acima ?? ''}
              className="campo"
            />
          </div>

          <div>
            <label htmlFor={id('pedido-minimo')} className="legenda">Pedido mínimo (R$)</label>
            <input
              id={id('pedido-minimo')}
              type="number"
              name="pedido_minimo"
              min="0"
              step="0.01"
              placeholder="0,00"
              defaultValue={cotacao?.pedido_minimo ?? ''}
              className="campo"
            />
          </div>
        </div>
      </fieldset>

      {!cotacao && (
        <div className="border-t border-linha-2 pt-5">
          <label htmlFor={id('arquivo')} className="legenda">
            Tabela de preços do fornecedor
          </label>
          <input
            id={id('arquivo')}
            type="file"
            name="arquivo"
            accept={ACCEPT_ARQUIVO_COTACAO}
            className="block w-full cursor-pointer text-[13px] text-ardosia file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-linha file:bg-papel file:px-3.5 file:text-[13px] file:font-medium file:text-grafite hover:file:bg-nevoa"
          />
          <p className="ajuda">PDF, planilha (XLSX/XLS) ou foto da tabela, até 10 MB. Dá para anexar depois também.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn btn-primario">
          {pending && <span className="girador" aria-hidden="true" />}
          {pending ? 'Salvando…' : cotacao ? 'Salvar condições' : 'Criar cotação'}
        </button>
        {!cotacao && (
          <Link href="/cotacoes" className="btn btn-secundario">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}
