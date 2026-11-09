import { redirect } from 'next/navigation'

// O orçamento novo é adicionado num modal na própria cotação; o endereço antigo
// abre esse modal
export default async function NovoOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/cotacoes-proprias/${id}?adicionar=1`)
}
