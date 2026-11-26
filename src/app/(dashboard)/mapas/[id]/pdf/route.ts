import { createClient } from '@/lib/supabase/server'
import { carregarDocumentoMapa } from '@/lib/mapas'
import { gerarMapaPdf } from '@/lib/mapa-pdf'
import { dataHora, nomeArquivo, respostaPdf } from '@/components/pdf/base'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const doc = await carregarDocumentoMapa(supabase, id)
  if (!doc) return new Response('Mapa não encontrado.', { status: 404 })

  const pdf = await gerarMapaPdf(doc, dataHora(new Date().toISOString()))
  return respostaPdf(pdf, nomeArquivo('mapa', doc.mapa.titulo))
}
