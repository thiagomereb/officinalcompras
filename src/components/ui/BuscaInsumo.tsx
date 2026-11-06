'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { buscarInsumos, type InsumoOpcao } from '@/lib/supabase/busca-insumos'

interface Props {
  // Com name, o id escolhido vai num input oculto (para formulários)
  name?: string
  onSelecionar?: (insumo: InsumoOpcao) => void
  placeholder?: string
  compacto?: boolean
  desabilitado?: boolean
  autoFocus?: boolean
}

// Espera entre teclas antes de consultar o banco
const ESPERA_MS = 180
// Altura máxima da lista (max-h-64) mais folga: abaixo disso, abre para cima
const ALTURA_LISTA = 270

type Posicao = { left: number; width: number; top?: number; bottom?: number }

export function BuscaInsumo({
  name,
  onSelecionar,
  placeholder = 'Buscar por nome ou sinônimo…',
  compacto = false,
  desabilitado = false,
  autoFocus = false,
}: Props) {
  const idLista = useId()
  const [texto, setTexto] = useState('')
  const [opcoes, setOpcoes] = useState<InsumoOpcao[]>([])
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [escolhido, setEscolhido] = useState<InsumoOpcao | null>(null)
  const [posicao, setPosicao] = useState<Posicao | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Numera as consultas: resposta que chega depois de uma mais nova é descartada
  const consulta = useRef(0)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => {
      document.removeEventListener('mousedown', fora)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // Posição da lista a partir do campo; abre para cima se faltar espaço embaixo
  function calcularPosicao(): Posicao | null {
    const r = campo.current?.getBoundingClientRect()
    if (!r) return null
    const abaixo = window.innerHeight - r.bottom
    return abaixo < ALTURA_LISTA && r.top > abaixo
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
      : { left: r.left, width: r.width, top: r.bottom + 4 }
  }

  // A lista flutua com posição fixa (para não ser cortada por tabelas com
  // rolagem e diálogos), então acompanha o campo quando a página rola ou a
  // janela muda de tamanho — no celular isso acontece quando o teclado abre.
  // Só fecha se o campo sair da tela.
  useEffect(() => {
    if (!aberto) return
    function acompanhar(e: Event) {
      if (e.target instanceof Node && lista.current?.contains(e.target)) return
      const r = campo.current?.getBoundingClientRect()
      if (!r || r.bottom < 0 || r.top > window.innerHeight) {
        setAberto(false)
        return
      }
      setPosicao(calcularPosicao())
    }
    window.addEventListener('scroll', acompanhar, true)
    window.addEventListener('resize', acompanhar)
    return () => {
      window.removeEventListener('scroll', acompanhar, true)
      window.removeEventListener('resize', acompanhar)
    }
  }, [aberto])

  function abrir() {
    setPosicao(calcularPosicao())
    setAberto(true)
  }

  function aoDigitar(valor: string) {
    setTexto(valor)
    setEscolhido(null)
    setErro(null)
    if (timer.current) clearTimeout(timer.current)

    const termo = valor.trim()
    const n = ++consulta.current
    if (termo.length < 2) {
      setOpcoes([])
      setAberto(false)
      setCarregando(false)
      return
    }

    setCarregando(true)
    timer.current = setTimeout(async () => {
      try {
        const resultado = await buscarInsumos(termo)
        if (n !== consulta.current) return
        setOpcoes(resultado)
        setAtivo(0)
        abrir()
      } catch (e) {
        if (n !== consulta.current) return
        setErro((e as Error).message)
        setOpcoes([])
        abrir()
      } finally {
        if (n === consulta.current) setCarregando(false)
      }
    }, ESPERA_MS)
  }

  function selecionar(insumo: InsumoOpcao) {
    setEscolhido(insumo)
    setTexto(insumo.nome_padrao)
    setAberto(false)
    onSelecionar?.(insumo)
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (opcoes.length) abrir()
      setAtivo((a) => Math.min(a + 1, opcoes.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      // Só segura o Enter quando ele escolhe um insumo; senão o form envia normal
      if (aberto && opcoes[ativo]) {
        e.preventDefault()
        selecionar(opcoes[ativo])
      }
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  return (
    <div ref={caixa} className="relative">
      {name && <input type="hidden" name={name} value={escolhido?.id ?? ''} />}
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardosia-2"
      />
      <input
        ref={campo}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && opcoes[ativo] ? `${idLista}-${ativo}` : undefined}
        value={texto}
        onChange={(e) => aoDigitar(e.target.value)}
        onKeyDown={aoTeclar}
        onFocus={() => {
          if (opcoes.length && !escolhido) abrir()
        }}
        placeholder={placeholder}
        disabled={desabilitado}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={`campo pl-8 pr-8 ${compacto ? 'campo-sm' : ''}`}
      />
      {escolhido ? (
        <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-salvia" aria-hidden="true" />
      ) : (
        carregando && (
          <span className="nav-pendente absolute right-3 top-1/2 -mt-1.5" data-pendente="true" aria-hidden="true" />
        )
      )}

      {aberto && posicao && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          style={{ position: 'fixed', ...posicao }}
          // whitespace-normal: dentro de tabelas a lista herdaria o nowrap das células
          className="z-[60] max-h-64 overflow-y-auto overflow-x-hidden whitespace-normal rounded-lg border border-linha bg-papel py-1 shadow-lg shadow-grafite/5"
        >
          {erro ? (
            <li className="px-3 py-2 text-[13px] text-oxido">Não foi possível buscar: {erro}</li>
          ) : opcoes.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-ardosia">
              Nenhum insumo encontrado para &ldquo;{texto.trim()}&rdquo;.
            </li>
          ) : (
            opcoes.map((o, i) => (
              <li
                key={o.id}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selecionar(o)
                }}
                onMouseEnter={() => setAtivo(i)}
                className={`cursor-pointer px-3 py-2 ${i === ativo ? 'bg-nevoa' : ''}`}
              >
                <span className="block text-[13.5px] leading-snug">{o.nome_padrao}</span>
                {o.via_sinonimo && (
                  <span className="mt-0.5 block text-[11.5px] text-ardosia">sinônimo: {o.via_sinonimo}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
