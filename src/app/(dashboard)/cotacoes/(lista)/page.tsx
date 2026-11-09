import { redirect } from 'next/navigation'

// Os orçamentos dos fornecedores agora vivem dentro da cotação própria
export default function CotacoesPage() {
  redirect('/cotacoes-proprias')
}
