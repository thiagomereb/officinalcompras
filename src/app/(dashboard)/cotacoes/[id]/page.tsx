import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// O orçamento agora é aberto dentro da cotação própria; links antigos (painel,
// histórico) continuam chegando aqui
export default async function CotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('cotacoes').select('cotacao_propria_id').eq('id', id).single()
  if (!data) notFound()
  redirect(`/cotacoes-proprias/${data.cotacao_propria_id}/orcamentos/${id}`)
}
