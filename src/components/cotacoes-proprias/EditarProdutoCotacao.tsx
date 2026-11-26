'use client'

import { useId, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'
import type { InsumoOpcao } from '@/lib/supabase/busca-insumos'
import { UNIDADES_QUANTIDADE, ehUnidadeQuantidade, normalizarUnidade, type UnidadeQuantidade } from '@/lib/unidades'
import { codigoNaUnidade, nomeUnidade, unidadeDaCotacao } from '@/lib/unidades-farmacia'
import { numeroDigitado } from '@/lib/numero'
import type { Falha } from '@/lib/acoes'

export type ProdutoParaEditar = {
  id: string
  codigo: string
  nome: string
  teor: number | null
  quantidade: number
  unidade: string
  insumo_id: string
  insumo_nome: string
  incluido_a_mao: boolean
}

export type EditarProduto = (payload: unknown) => Promise<Falha | { nome: string }>

interface Props {
  cotacaoPropriaId: string
  unidadeCotacao: string | null
  produto: ProdutoParaEditar
  editar: EditarProduto
  onFechar: () => void
}

const quantidadeBR = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
// Para o campo: sem ponto de milhar, vírgula decimal ("1000", "12,092")
const paraCampo = (n: number) => String(n).replace('.', ',')

// Corrige um produto do pedido da cotação própria: insumo, código, teor e quantidade
export function EditarProdutoCotacao({ cotacaoPropriaId, unidadeCotacao, produto, editar, onFechar }: Props) {
  const idForm = useId()
  const [insumo, setInsumo] = useState<{ id: string; nome: string }>({ id: produto.insumo_id, nome: produto.insumo_nome })
  const [trocando, setTrocando] = useState(false)
  const [codigo, setCodigo] = useState(produto.codigo)
  const [teor, setTeor] = useState(produto.teor != null ? paraCampo(produto.teor) : '')
  const [quantidade, setQuantidade] = useState(paraCampo(produto.quantidade))
  const [unidade, setUnidade] = useState<UnidadeQuantidade>(() => {
    const u = normalizarUnidade(produto.unidade)
    return ehUnidadeQuantidade(u) ? u : 'g'
  })
  const [erro, setErro] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function escolher(i: InsumoOpcao) {
    setInsumo({ id: i.id, nome: i.nome_padrao })
    setTrocando(false)
    setErro(null)
    // O código do insumo novo nesta unidade, se o cadastro tiver
    const doCadastro = i.codigos ? codigoNaUnidade(i.codigos, unidadeDaCotacao(unidadeCotacao)) : null
    if (doCadastro) setCodigo(doCadastro)
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const q = numeroDigitado(quantidade)
    const t = teor.trim() ? numeroDigitado(teor) : null
    if (!/^\d+$/.test(codigo.trim())) return setErro('Informe o código do produto no sistema da farmácia (só números).')
    if (teor.trim() && (t == null || t < 0 || t > 100)) return setErro('O teor vai de 0 a 100%.')
    if (q == null || q <= 0) return setErro('Informe a quantidade pedida.')

    setErro(null)
    startTransition(async () => {
      try {
        const r = await editar({
          cotacaoPropriaId,
          itemId: produto.id,
          insumoId: insumo.id,
          codigo: codigo.trim(),
          teor: t,
          quantidade: q,
          unidade,
        })
        if ('erro' in r) {
          setErro(r.erro)
          return
        }
        onFechar()
      } catch (e) {
        setErro((e as Error).message)
      }
    })
  }

  const trocouInsumo = insumo.id !== produto.insumo_id

  return (
    <Modal
      aberto
      onFechar={() => !pending && onFechar()}
      travado={pending}
      titulo="Editar produto do pedido"
      rodape={
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" form={idForm} disabled={pending} className="btn btn-primario">
            {pending && <span className="girador" aria-hidden="true" />}
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" onClick={onFechar} disabled={pending} className="btn btn-secundario">
            Cancelar
          </button>
        </div>
      }
    >
      <form id={idForm} onSubmit={enviar} className="space-y-4 px-6 py-5">
        <p className="text-[12.5px] text-ardosia">
          {produto.incluido_a_mao ? 'Incluído à mão.' : 'Veio no PDF da cotação como:'}{' '}
          <span className="leitura">{produto.codigo}</span> - {produto.nome} ·{' '}
          <span className="leitura">
            {quantidadeBR(produto.quantidade)} {produto.unidade}
          </span>
        </p>

        <div>
          <span className="legenda">Insumo do cadastro</span>
          {trocando ? (
            <div className="space-y-1.5">
              <BuscaInsumo autoFocus onSelecionar={escolher} placeholder="Buscar por nome, sinônimo ou código…" />
              <button type="button" onClick={() => setTrocando(false)} className="text-[12px] text-ardosia hover:underline">
                Manter {insumo.nome}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-linha px-3 py-2 text-[13.5px]">
              <Check size={14} className="shrink-0 text-salvia" />
              <span className="min-w-0 flex-1 truncate font-medium">{insumo.nome}</span>
              <button type="button" onClick={() => setTrocando(true)} disabled={pending} className="btn btn-fantasma btn-sm">
                Trocar
              </button>
            </div>
          )}
          {trocouInsumo && (
            <p className="mt-1 text-[12px] text-ardosia">
              As ofertas dos orçamentos ligadas a este produto vão junto para o insumo novo; a escolha delas num mapa em
              rascunho é desfeita.
            </p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <label htmlFor={`${idForm}-codigo`} className="legenda">
              Código em {nomeUnidade(unidadeDaCotacao(unidadeCotacao))} <span className="obrigatorio">*</span>
            </label>
            <input
              id={`${idForm}-codigo`}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={15}
              className="campo leitura"
            />
          </div>
          <div>
            <label htmlFor={`${idForm}-teor`} className="legenda">
              Teor (%)
            </label>
            <input
              id={`${idForm}-teor`}
              value={teor}
              onChange={(e) => setTeor(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              className="campo leitura"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <label htmlFor={`${idForm}-quantidade`} className="legenda">
              Quantidade pedida <span className="obrigatorio">*</span>
            </label>
            <input
              id={`${idForm}-quantidade`}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
              className="campo leitura"
            />
          </div>
          <div>
            <label htmlFor={`${idForm}-unidade`} className="legenda">
              Unidade
            </label>
            <select
              id={`${idForm}-unidade`}
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as UnidadeQuantidade)}
              className="campo"
            >
              {UNIDADES_QUANTIDADE.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {erro && (
          <p className="aviso aviso-erro" role="alert">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  )
}
