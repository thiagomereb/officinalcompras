'use client'

import { useId, useState, useTransition } from 'react'
import { Check, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { BuscaInsumo } from '@/components/ui/BuscaInsumo'
import { createClient } from '@/lib/supabase/client'
import type { InsumoOpcao } from '@/lib/supabase/busca-insumos'
import { UNIDADES_QUANTIDADE, ehUnidadeQuantidade, normalizarUnidade, type UnidadeQuantidade } from '@/lib/unidades'
import { numeroDigitado } from '@/lib/numero'
import { chaveUnidade, nomeCurtoUnidade } from '@/lib/unidades-farmacia'
import type { Falha } from '@/lib/acoes'

type Incluido = { codigo: string; nome: string; ofertas: number }

interface Props {
  cotacaoPropriaId: string
  // A unidade da farmácia da cotação: o código do produto é o desta unidade
  unidadeCotacao: string | null
  incluir: (payload: unknown) => Promise<Falha | Incluido>
  // Por que não dá para incluir (mapa aprovado); null libera
  bloqueio: string | null
}

const numeroBR = numeroDigitado

// Produto que faltou na cotação gerada pelo sistema da farmácia. O modal fica
// aberto depois de incluir, para emendar o próximo
export function IncluirProduto({ cotacaoPropriaId, unidadeCotacao, incluir, bloqueio }: Props) {
  const idForm = useId()
  const [aberto, setAberto] = useState(false)
  const [foraDoCadastro, setForaDoCadastro] = useState(false)
  const [insumo, setInsumo] = useState<InsumoOpcao | null>(null)
  const [codigoDoCadastro, setCodigoDoCadastro] = useState(false)
  const [nome, setNome] = useState('')
  const [codigo, setCodigo] = useState('')
  const [teor, setTeor] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState<UnidadeQuantidade>('g')
  const [erro, setErro] = useState<string | null>(null)
  const [incluidos, setIncluidos] = useState<Incluido[]>([])
  const [pending, startTransition] = useTransition()

  function limpar() {
    setForaDoCadastro(false)
    setInsumo(null)
    setCodigoDoCadastro(false)
    setNome('')
    setCodigo('')
    setTeor('')
    setQuantidade('')
    setErro(null)
  }

  function fechar() {
    if (pending) return
    limpar()
    setIncluidos([])
    setAberto(false)
  }

  async function escolher(i: InsumoOpcao) {
    setInsumo(i)
    setErro(null)
    const chave = chaveUnidade(unidadeCotacao)
    let doCadastro = i.codigos.find((c) => c.unidade === chave)?.codigo ?? null
    let unidadePadrao = i.unidade_padrao
    // A busca por semelhança não traz o código nem a unidade
    if (!i.codigos.length) {
      const supabase = createClient()
      const [{ data: cod }, { data: ins }] = await Promise.all([
        supabase.from('insumo_codigos').select('codigo').eq('insumo_id', i.id).eq('unidade', chave).maybeSingle(),
        supabase.from('insumos').select('unidade_padrao').eq('id', i.id).maybeSingle(),
      ])
      doCadastro = cod?.codigo ?? null
      unidadePadrao = ins?.unidade_padrao ?? unidadePadrao
    }
    setCodigo(doCadastro ?? '')
    setCodigoDoCadastro(!!doCadastro)
    const u = normalizarUnidade(unidadePadrao)
    if (ehUnidadeQuantidade(u)) setUnidade(u)
  }

  function trocarInsumo() {
    setInsumo(null)
    setCodigoDoCadastro(false)
    setCodigo('')
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const q = numeroBR(quantidade)
    const t = teor.trim() ? numeroBR(teor) : null
    if (!foraDoCadastro && !insumo) return setErro('Escolha o insumo no cadastro, ou marque que ele não está no cadastro.')
    if (foraDoCadastro && !nome.trim()) return setErro('Digite o nome do produto.')
    if (!/^\d+$/.test(codigo.trim())) return setErro('Informe o código do produto no sistema da farmácia (só números).')
    if (teor.trim() && (t == null || t < 0 || t > 100)) return setErro('O teor vai de 0 a 100%.')
    if (q == null || q <= 0) return setErro('Informe a quantidade pedida.')

    setErro(null)
    startTransition(async () => {
      try {
        const r = await incluir({
          cotacaoPropriaId,
          insumoId: foraDoCadastro ? null : insumo!.id,
          nome: foraDoCadastro ? nome.trim() : null,
          codigo: codigo.trim(),
          teor: t,
          quantidade: q,
          unidade,
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
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={!!bloqueio}
        title={bloqueio ?? 'Incluir um produto que faltou na cotação'}
        className="btn btn-secundario btn-sm"
      >
        <Plus size={14} />
        Incluir produto
      </button>

      <Modal
        aberto={aberto}
        onFechar={fechar}
        travado={pending}
        titulo="Incluir produto na cotação"
        rodape={
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" form={idForm} disabled={pending} className="btn btn-primario">
              {pending && <span className="girador" aria-hidden="true" />}
              {pending ? 'Incluindo…' : 'Incluir produto'}
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
              {incluidos.map((i) => (
                <li key={i.codigo} className="flex gap-2">
                  <Check size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Incluído: <span className="leitura">{i.codigo}</span> - {i.nome}
                    {i.ofertas > 0 && ` · ${i.ofertas} oferta(s) de orçamentos já lidos ligada(s) a ele por sinônimo`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[12.5px] text-ardosia">
            O produto passa a valer como os do PDF: entra na leitura dos próximos orçamentos, no mapa e na ordem de compra.
            Num orçamento já lido, ligue o item a ele na página do orçamento.
          </p>

          <div>
            {foraDoCadastro ? (
              <>
                <label htmlFor={`${idForm}-nome`} className="legenda">
                  Nome do produto <span className="obrigatorio">*</span>
                </label>
                <input
                  id={`${idForm}-nome`}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={300}
                  autoFocus
                  placeholder="Como está no sistema da farmácia"
                  className="campo"
                />
                <p className="mt-1 text-[12px] text-ardosia">Entra também no cadastro de insumos.</p>
              </>
            ) : (
              <>
                <span className="legenda">
                  Insumo <span className="obrigatorio">*</span>
                </span>
                {insumo ? (
                  <div className="flex items-center gap-2 rounded-lg border border-linha px-3 py-2 text-[13.5px]">
                    <Check size={14} className="shrink-0 text-salvia" />
                    <span className="min-w-0 flex-1 truncate font-medium">{insumo.nome_padrao}</span>
                    <button type="button" onClick={trocarInsumo} disabled={pending} className="btn btn-fantasma btn-sm">
                      Trocar
                    </button>
                  </div>
                ) : (
                  <BuscaInsumo autoFocus onSelecionar={escolher} placeholder="Buscar por nome, sinônimo ou código…" />
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setForaDoCadastro((f) => !f)
                trocarInsumo()
                setNome('')
                setErro(null)
              }}
              disabled={pending}
              className="mt-1.5 text-[12px] text-ardosia underline-offset-2 hover:underline"
            >
              {foraDoCadastro ? 'Buscar no cadastro de insumos' : 'Não está no cadastro de insumos'}
            </button>
          </div>

          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div>
              <label htmlFor={`${idForm}-codigo`} className="legenda">
                Código na unidade {nomeCurtoUnidade(unidadeCotacao)} <span className="obrigatorio">*</span>
              </label>
              <input
                id={`${idForm}-codigo`}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                readOnly={codigoDoCadastro}
                inputMode="numeric"
                maxLength={15}
                className={`campo leitura ${codigoDoCadastro ? 'bg-nevoa' : ''}`}
              />
              {codigoDoCadastro && <p className="mt-1 text-[12px] text-ardosia">O código deste insumo nesta unidade.</p>}
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
    </>
  )
}
