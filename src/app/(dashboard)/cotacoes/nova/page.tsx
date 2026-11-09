import { redirect } from 'next/navigation'

// Orçamento novo entra pela cotação própria a que ele responde
export default function NovaCotacaoPage() {
  redirect('/cotacoes-proprias')
}
