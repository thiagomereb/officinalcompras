'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { enviarArquivoCotacao, removerArquivoCotacao, LIMITE_ARQUIVO_BYTES } from '@/lib/supabase/upload'
import { lerCotacaoPropria, linhasDoPdf, type CotacaoPropriaLida } from '@/lib/cotacao-propria'
import type { importarCotacaoPropria } from '@/app/(dashboard)/cotacoes-proprias/actions'

interface Props {
  action: typeof importarCotacaoPropria
}

const AMOSTRA = 8

const quantidadeBR = (q: number) => q.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

// O PDF é lido aqui no navegador (é texto, não precisa de OCR) e só sobe para o
// Storage quando o comprador confirma o que foi lido
export function ImportarCotacaoPropria({ action }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [lida, setLida] = useState<CotacaoPropriaLida | null>(null)
  const [existente, setExistente] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()
  const router = useRouter()

  async function ler(f: File) {
    setArquivo(f)
    setLida(null)
    setExistente(null)
    setErro(null)
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setErro('Envie o PDF do relatório "Produtos para cotação".')
      return
    }
    if (f.size > LIMITE_ARQUIVO_BYTES) {
      setErro(`Arquivo muito grande. O limite é ${LIMITE_ARQUIVO_BYTES / 1024 / 1024} MB.`)
      return
    }

    setLendo(true)
    try {
      const r = lerCotacaoPropria(await linhasDoPdf(await f.arrayBuffer()))
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      const { data } = await createClient()
        .from('cotacoes_proprias')
        .select('id')
        .eq('numero', r.cotacao.numero)
        .maybeSingle()
      setExistente(data?.id ?? null)
      setLida(r.cotacao)
    } catch (e) {
      setErro(`Não foi possível ler o PDF: ${(e as Error).message}`)
    } finally {
      setLendo(false)
    }
  }

  function importar() {
    if (!arquivo || !lida) return
    setErro(null)
    startTransition(async () => {
      let path: string | null = null
      try {
        path = await enviarArquivoCotacao(arquivo, arquivo.name)
        const r = await action({ ...lida, arquivoUrl: path, arquivoNome: arquivo.name })
        if ('erro' in r) {
          await removerArquivoCotacao(path)
          setErro(r.erro)
          return
        }
        // Gravada: o PDF fica no Storage, a cotação aponta para ele
        path = null
        router.push(`/cotacoes-proprias/${r.id}`)
      } catch (e) {
        if (path) await removerArquivoCotacao(path)
        setErro((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-5">
      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-linha bg-papel px-6 py-9 text-center transition-colors hover:bg-nevoa/60 ${enviando ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) void ler(f)
        }}
      >
        <FileUp size={22} strokeWidth={1.6} className="text-ardosia" />
        <span className="text-[13.5px] font-medium">
          {arquivo ? arquivo.name : 'Escolha ou arraste o PDF da cotação'}
        </span>
        <span className="text-[12.5px] text-ardosia">Relatório “Produtos para cotação” gerado no sistema da farmácia</span>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          disabled={enviando}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void ler(f)
            e.target.value = ''
          }}
        />
      </label>

      {lendo && (
        <p className="flex items-center gap-2 text-[13px] text-ardosia" role="status">
          <span className="girador" aria-hidden="true" />
          Lendo o PDF…
        </p>
      )}

      {erro && (
        <p className="aviso aviso-erro" role="alert">
          {erro}
        </p>
      )}

      {lida && (
        <section className="painel">
          <div className="painel-topo">
            <div>
              <h2 className="painel-titulo">Cotação {lida.numero}</h2>
              <p className="text-[12.5px] text-ardosia">
                {[lida.unidade, lida.emitidaEm && `emitida em ${dataHoraBR(lida.emitidaEm)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="selo selo-ok">{lida.itens.length} produtos lidos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="tabela tabela-compacta whitespace-nowrap">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Produto</th>
                  <th className="num">Teor</th>
                  <th className="num">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {lida.itens.slice(0, AMOSTRA).map((i) => (
                  <tr key={i.codigo}>
                    <td className="leitura text-ardosia">{i.codigo}</td>
                    <td>{i.nome}</td>
                    <td className="num leitura text-ardosia">{i.teor != null ? `${quantidadeBR(i.teor)}%` : '—'}</td>
                    <td className="num leitura">
                      {quantidadeBR(i.quantidade)} {i.unidade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lida.itens.length > AMOSTRA && (
            <p className="border-t border-linha-2 px-5 py-2.5 text-[12.5px] text-ardosia">
              e mais {lida.itens.length - AMOSTRA} produto(s)
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-linha-2 px-5 py-4">
            {existente ? (
              <p className="aviso aviso-atencao w-full" role="status">
                <span>
                  A cotação {lida.numero} já foi importada.{' '}
                  <Link href={`/cotacoes-proprias/${existente}`} className="font-medium underline underline-offset-2">
                    Abrir a cotação
                  </Link>
                </span>
              </p>
            ) : (
              <>
                <button onClick={importar} disabled={enviando} className="btn btn-primario">
                  {enviando && <span className="girador" aria-hidden="true" />}
                  {enviando ? 'Importando…' : 'Importar cotação'}
                </button>
                <p className="text-[12.5px] text-ardosia">
                  Produto que ainda não está no cadastro de insumos entra nele com o nome e o código do sistema.
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
