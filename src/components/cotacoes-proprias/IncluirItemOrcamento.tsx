'use client'

import { useId, useState, useTransition } from 'react'
import { Check, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { LeituraPreco } from '@/components/ui/LeituraPreco'
import { numeroDigitado } from '@/lib/numero'
import { UNIDADES_EMBALAGEM, ehUnidadeEmbalagem, precoPorUnidadeBase, type UnidadeEmbalagem } from '@/lib/unidades'
import type { Falha } from '@/lib/acoes'
import { QuantidadePedida, SeletorProdutoPedido, type ProdutoPedidoOpcao } from './SeletorProdutoPedido'

type Incluido = { descricao: string; pedido: string | null }

interface Props {
  orcamentoId: string
  cotacaoPropriaId: string
  pedidos: ProdutoPedidoOpcao[]
  incluir: (payload: unknown) => Promise<Falha | Incluido>
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Item do orçamento que a leitura não trouxe. O modal fica aberto depois de
// incluir, para emendar o próximo
export function IncluirItemOrcamento({ orcamentoId, cotacaoPropriaId, pedidos, incluir }: Props) {
  const idForm = useId()
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [pedido, setPedido] = useState<ProdutoPedidoOpcao | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [embalagem, setEmbalagem] = useState('')
  const [unidade, setUnidade] = useState<UnidadeEmbalagem>('g')
  const [embalagens, setEmbalagens] = useState('1')
  const [preco, setPreco] = useState('')
  const [validade, setValidade] = useState('')
  const [ipi, setIpi] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [incluidos, setIncluidos] = useState<Incluido[]>([])
  const [pending, startTransition] = useTransition()

  function limpar() {
    setDescricao('')
    setPedido(null)
    setEscolhendo(false)
    setEmbalagem('')
    setEmbalagens('1')
    setPreco('')
    setValidade('')
    setIpi('')
    setErro(null)
  }

  function fechar() {
    if (pending) return
    limpar()
    setIncluidos([])
    setAberto(false)
  }

  function escolher(p: ProdutoPedidoOpcao | null) {
    setPedido(p)
    setEscolhendo(false)
    // A unidade do pedido costuma ser a da embalagem cotada
    if (p && !embalagem && ehUnidadeEmbalagem(p.unidade)) setUnidade(p.unidade)
  }

  const nEmbalagem = numeroDigitado(embalagem)
  const nEmbalagens = numeroDigitado(embalagens)
  const nPreco = numeroDigitado(preco)
  const prontoParaConta = nEmbalagem != null && nEmbalagem > 0 && nEmbalagens != null && nEmbalagens > 0 && nPreco != null && nPreco > 0
  const base = prontoParaConta ? precoPorUnidadeBase(nPreco, nEmbalagem, unidade) : null

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const nIpi = ipi.trim() ? numeroDigitado(ipi) : null
    if (!descricao.trim()) return setErro('Informe a descrição do item, como está no orçamento.')
    if (!(nEmbalagem != null && nEmbalagem > 0)) return setErro('Informe o tamanho da embalagem.')
    if (!(nEmbalagens != null && nEmbalagens > 0)) return setErro('Informe quantas embalagens foram cotadas.')
    if (!(nPreco != null && nPreco > 0)) return setErro('Informe o preço da embalagem.')
    if (ipi.trim() && (nIpi == null || nIpi < 0 || nIpi > 100)) return setErro('O IPI vai de 0 a 100%.')

    setErro(null)
    startTransition(async () => {
      try {
        const r = await incluir({
          orcamentoId,
          cotacaoPropriaId,
          pedidoId: pedido?.id ?? null,
          descricao: descricao.trim(),
          embalagem: nEmbalagem,
          unidade,
          embalagens: nEmbalagens,
          preco: nPreco,
          validade: validade || null,
          ipi: nIpi,
        })
        if ('erro' in r) {
          setErro(r.erro)
          return
        }
        // A página se atualiza sozinha (revalidatePath na action)
        setIncluidos((l) => [...l, r])
        limpar()
      } catch (e) {
        setErro((e as Error).message)
      }
    })
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="btn btn-secundario btn-sm" title="Incluir um item que a leitura não trouxe">
        <Plus size={14} />
        Incluir item
      </button>

      <Modal
        aberto={aberto}
        onFechar={fechar}
        travado={pending}
        titulo="Incluir item no orçamento"
        rodape={
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" form={idForm} disabled={pending} className="btn btn-primario">
              {pending && <span className="girador" aria-hidden="true" />}
              {pending ? 'Incluindo…' : 'Incluir item'}
            </button>
            <button type="button" onClick={fechar} disabled={pending} className="btn btn-secundario">
              {incluidos.length ? 'Fechar' : 'Cancelar'}
            </button>
          </div>
        }
      >
        <form id={idForm} onSubmit={enviar} className="space-y-4 px-6 py-5">
          {incluidos.length > 0 && (
            <ul className="aviso aviso-ok space-y-1" role="status">
              {incluidos.map((i, k) => (
                <li key={k} className="flex gap-2">
                  <Check size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Incluído: {i.descricao}
                    {i.pedido ? ` · ligado a ${i.pedido}` : ' · fora da cotação'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[12.5px] text-ardosia">
            Para o item que está no orçamento do fornecedor mas a leitura não trouxe. Ele entra como os outros: no mapa
            e na ordem de compra.
          </p>

          <div>
            <label htmlFor={`${idForm}-descricao`} className="legenda">
              Descrição do item <span className="obrigatorio">*</span>
            </label>
            <input
              id={`${idForm}-descricao`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={500}
              autoFocus
              placeholder="Como está no orçamento do fornecedor"
              className="campo"
            />
          </div>

          <div>
            <span className="legenda">Produto pedido</span>
            {escolhendo ? (
              <SeletorProdutoPedido
                pedidos={pedidos}
                pendente={pending}
                sugestao={descricao}
                onEscolher={escolher}
                onCancelar={() => setEscolhendo(false)}
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-linha px-3 py-2 text-[13.5px]">
                {pedido ? (
                  <>
                    <Check size={14} className="shrink-0 text-salvia" />
                    <span className="min-w-0 flex-1 truncate font-medium" title={`${pedido.codigo} · ${pedido.nome}`}>
                      {pedido.nome}
                    </span>
                    <QuantidadePedida produto={pedido} />
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-ardosia">Fora da cotação</span>
                )}
                <button type="button" onClick={() => setEscolhendo(true)} disabled={pending} className="btn btn-fantasma btn-sm">
                  {pedido ? 'Trocar' : 'Escolher'}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[1fr_96px_1fr] gap-3">
            <div>
              <label htmlFor={`${idForm}-embalagem`} className="legenda">
                Embalagem <span className="obrigatorio">*</span>
              </label>
              <input
                id={`${idForm}-embalagem`}
                value={embalagem}
                onChange={(e) => setEmbalagem(e.target.value)}
                inputMode="decimal"
                placeholder="1"
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
                onChange={(e) => setUnidade(e.target.value as UnidadeEmbalagem)}
                className="campo"
              >
                {UNIDADES_EMBALAGEM.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${idForm}-embalagens`} className="legenda">
                Embalagens cotadas <span className="obrigatorio">*</span>
              </label>
              <input
                id={`${idForm}-embalagens`}
                value={embalagens}
                onChange={(e) => setEmbalagens(e.target.value)}
                inputMode="decimal"
                className="campo leitura"
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr_96px] gap-3">
            <div>
              <label htmlFor={`${idForm}-preco`} className="legenda">
                Preço da embalagem (R$) <span className="obrigatorio">*</span>
              </label>
              <input
                id={`${idForm}-preco`}
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="campo leitura"
              />
            </div>
            <div>
              <label htmlFor={`${idForm}-validade`} className="legenda">
                Validade
              </label>
              <input
                id={`${idForm}-validade`}
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor={`${idForm}-ipi`} className="legenda">
                IPI (%)
              </label>
              <input
                id={`${idForm}-ipi`}
                value={ipi}
                onChange={(e) => setIpi(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="campo leitura"
              />
            </div>
          </div>

          {prontoParaConta && base && (
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-nevoa px-3 py-2 text-[13px] text-ardosia">
              <span>
                Total do item <span className="leitura font-medium text-grafite">{moeda(nPreco * nEmbalagens)}</span>
              </span>
              <span>
                Por unidade base <LeituraPreco valor={base.valor} base={base.base} />
              </span>
            </p>
          )}

          {erro && (
            <p className="aviso aviso-erro" role="alert">
              {erro}
            </p>
          )}
        </form>
      </Modal>
    </>
  )
}
