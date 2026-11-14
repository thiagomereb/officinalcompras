import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { carregarOrdensCompra } from '@/lib/mapas'
import { OrdemCompraPdf } from '@/components/pdf/OrdemCompraPdf'
import { nomeArquivo, respostaPdf } from '@/components/pdf/base'

const FUSO = 'America/Sao_Paulo'

// ?f=<fornecedor>: só a ordem dele; sem f, todas num PDF só (uma por página).
// ?ver=1 abre no navegador (prévia) em vez de baixar.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const chave = url.searchParams.get('f')

  const supabase = await createClient()
  const doc = await carregarOrdensCompra(supabase, id)
  if (!doc) return new Response('Mapa não encontrado.', { status: 404 })
  if (doc.mapa.status === 'cancelado') return new Response('Mapa cancelado não gera ordem de compra.', { status: 409 })

  const ordens = chave ? doc.ordens.filter((o) => o.chave === chave) : doc.ordens
  if (ordens.length === 0) return new Response('Nenhum item com fornecedor escolhido.', { status: 404 })

  const agora = new Date()
  const geradoEm = `${agora.toLocaleDateString('pt-BR', { timeZone: FUSO })} ${agora.toLocaleTimeString('pt-BR', { timeZone: FUSO })}`
  const pdf = await renderToBuffer(<OrdemCompraPdf doc={doc} ordens={ordens} geradoEm={geradoEm} />)

  const base = doc.numero ?? doc.mapa.titulo
  const arquivo = nomeArquivo('pedido', chave ? `${base} ${ordens[0].fornecedor}` : base)
  return respostaPdf(pdf, arquivo, url.searchParams.get('ver') === '1' ? 'inline' : 'attachment')
}
